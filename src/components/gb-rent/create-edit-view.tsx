"use client";
/**
 * GB Rent — Create / Edit listing view.
 *
 * Renders the full create-or-edit form for a Property. Used by the SPA shell
 * (src/app/page.tsx) for both `view = { name: "create" }` and
 * `view = { name: "edit", propertyId }`.
 *
 * Auth: requires NextAuth session. If unauthenticated → centered sign-in Card.
 *
 * Edit mode: fetches the property, blocks non-owners/non-admins, pre-fills all
 * fields including the existing images as already-uploaded photo entries.
 * Submitting a non-admin edit posts a toast warning that the listing has been
 * reset to PENDING for re-approval (this matches the backend's PUT behaviour).
 *
 * Create mode: empty form. Submitting POSTs and on success shows a success
 * state then navigates to the dashboard.
 *
 * Killer feature: an AI fair-price suggestion button next to the rent field
 * that calls /api/ai/predict-price and surfaces the predicted price + range +
 * confidence + a one-click "Use suggested price" CTA. Handles AI-service-down
 * (502) with a graceful toast.
 *
 * Photos: drag-drop + click-to-browse multi-file upload to /api/upload with an
 * instant local preview (URL.createObjectURL) that swaps to the server URL on
 * completion. Up/down reordering + remove + per-file retry on error.
 */
import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Upload,
  X,
  Sparkles,
  Loader2,
  ArrowLeft,
  ImageIcon,
  MapPin,
  Check,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  RotateCw,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABEL,
  CITY_ZONES,
  AMENITIES,
  formatPKR,
  formatPKRFull,
  type PropertyType,
  type CityZone,
  type AmenityKey,
} from "@/lib/constants";
import { AMENITY_ICON } from "@/components/gb-rent/amenity-icon";
import { PriceTag } from "@/components/gb-rent/price-tag";
import { EmptyState } from "@/components/gb-rent/empty-state";
import type { PropertyDTO, PropertyInput, PricePredictionResponse } from "@/types";
import { cn } from "@/lib/utils";

const MAX_TITLE = 100;
const MIN_DESC = 20;
const MIN_PRICE = 1000;
const MAX_ROOMS = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface FormState {
  title: string;
  type: PropertyType | "";
  address: string;
  area: string;
  cityZone: CityZone | "";
  price: string;
  rooms: string;
  size: string;
  amenities: AmenityKey[];
  description: string;
  latitude: string;
  longitude: string;
}

type FieldKey = keyof FormState | "photos";

interface PhotoItem {
  id: string;
  url: string | null;
  localPreview: string | null;
  status: "uploading" | "done" | "error";
  fileName: string;
  fileSize: number;
  file?: File;
  errorMsg?: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  type: "",
  address: "",
  area: "",
  cityZone: "",
  price: "",
  rooms: "",
  size: "",
  amenities: [],
  description: "",
  latitude: "",
  longitude: "",
};

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Upload a single file to /api/upload (multipart). Returns the relative URL. */
async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // On 401 the session is stale (e.g. DB re-seeded while the user was
    // signed in). Trigger the global stale-session handler so the user sees
    // a sign-in prompt instead of a confusing upload error.
    if (res.status === 401 && typeof window !== "undefined") {
      const handler = (window as unknown as { __gbStaleSession?: () => void }).__gbStaleSession;
      if (handler) handler();
    }
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : typeof data === "string"
          ? data
          : `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  return (data as { url: string }).url;
}

/**
 * Client-side image compression. Re-encodes the selected image through a
 * canvas at a capped dimension + JPEG quality, producing a much smaller
 * blob before it ever hits the network. This is essential in preview /
 * proxy environments that impose request-body size limits (real photos are
 * typically 2-8 MB; preview gateways often cap under ~1 MB and drop the
 * connection → browser sees "Failed to fetch").
 *
 * Behaviour:
 *   - Images smaller than SKIP_COMPRESSION_BELOW_BYTES (300 KB) are passed
 *     through untouched (already small enough; avoids re-encoding loss).
 *   - Larger images are drawn to an <canvas> capped at MAX_DIM px on the
 *     longest side (preserving aspect ratio) and re-encoded as JPEG at
 *     QUALITY. A 5 MB phone photo typically becomes ~200-400 KB.
 *   - Animated GIFs and non-decodable files are returned as-is (the browser
 *     will accept whatever it can decode; the server still validates type).
 *
 * Returns the File to actually upload (may be the original, may be compressed).
 */
const MAX_DIM = 1600;
const QUALITY = 0.82;
const SKIP_COMPRESSION_BELOW_BYTES = 300 * 1024; // 300 KB

async function compressImage(file: File): Promise<File> {
  // Skip if already small, or if it's not a decodable raster image we'd want
  // to re-encode (GIFs can be animated; SVGs are tiny; let the server decide
  // on anything we can't safely re-encode).
  if (file.size <= SKIP_COMPRESSION_BELOW_BYTES) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return file;

    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onerror = () => resolve(null);
      i.onload = () => resolve(i);
      i.src = dataUrl;
    });
    if (!img) return file;

    // Cap the longest side, preserve aspect ratio.
    let { width, height } = img;
    const longest = Math.max(width, height);
    if (longest > MAX_DIM) {
      const scale = MAX_DIM / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // White background so transparency doesn't go black on JPEG export.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) return file;

    // Preserve the original filename but switch extension to .jpg since we
    // re-encoded as JPEG. Keep the base name so users recognise their file.
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const compressedName = `${baseName}.jpg`;
    return new File([blob], compressedName, { type: "image/jpeg" });
  } catch {
    // Any failure → fall back to the original file. The server will still
    // validate, and at least we tried.
    return file;
  }
}

function validate(
  form: FormState,
  photoCount: number
): { field: FieldKey; message: string }[] {
  const errors: { field: FieldKey; message: string }[] = [];

  if (!form.title.trim()) errors.push({ field: "title", message: "Title is required" });
  else if (form.title.trim().length > MAX_TITLE)
    errors.push({ field: "title", message: `Title must be ${MAX_TITLE} characters or fewer` });

  if (!form.type) errors.push({ field: "type", message: "Pick a property type" });
  if (!form.address.trim()) errors.push({ field: "address", message: "Address is required" });
  if (!form.area.trim())
    errors.push({ field: "area", message: "Area / neighbourhood is required" });
  if (!form.cityZone) errors.push({ field: "cityZone", message: "Pick a city zone" });

  const priceNum = Number(form.price);
  if (!form.price || !Number.isFinite(priceNum) || priceNum < MIN_PRICE)
    errors.push({
      field: "price",
      message: `Monthly rent must be at least PKR ${MIN_PRICE.toLocaleString()}`,
    });

  const roomsNum = Number(form.rooms);
  if (form.rooms === "" || !Number.isFinite(roomsNum) || roomsNum < 0 || roomsNum > MAX_ROOMS)
    errors.push({ field: "rooms", message: `Rooms must be a number between 0 and ${MAX_ROOMS}` });

  if (form.size && (Number.isNaN(Number(form.size)) || Number(form.size) < 0))
    errors.push({ field: "size", message: "Size must be a non-negative number" });

  if (!form.description.trim())
    errors.push({ field: "description", message: "Description is required" });
  else if (form.description.trim().length < MIN_DESC)
    errors.push({
      field: "description",
      message: `Description must be at least ${MIN_DESC} characters`,
    });

  if (form.latitude && (Number.isNaN(Number(form.latitude)) || Math.abs(Number(form.latitude)) > 90))
    errors.push({ field: "latitude", message: "Latitude must be between -90 and 90" });
  if (form.longitude && (Number.isNaN(Number(form.longitude)) || Math.abs(Number(form.longitude)) > 180))
    errors.push({ field: "longitude", message: "Longitude must be between -180 and 180" });

  if (photoCount < 1)
    errors.push({ field: "photos", message: "Add at least 1 photo" });

  return errors;
}

export function CreateEditView({
  mode,
  propertyId,
}: {
  mode: "create" | "edit";
  propertyId?: string;
}) {
  const { status, data: session } = useSession();
  const go = useView((s) => s.go);
  const back = useView((s) => s.back);
  const openAuth = useUI((s) => s.openAuth);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProp, setLoadingProp] = useState(mode === "edit");
  const [notAllowed, setNotAllowed] = useState(false);
  const [errorFields, setErrorFields] = useState<Partial<Record<FieldKey, string>>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<PricePredictionResponse | null>(null);

  // Refs for scrolling/focusing on the first error field.
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup any object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const p of photos) {
        if (p.localPreview) URL.revokeObjectURL(p.localPreview);
      }
    };
  }, []);

  // ---- Edit mode: load the property once auth is resolved.
  useEffect(() => {
    if (mode !== "edit" || !propertyId) return;
    if (status !== "authenticated") {
      // Wait until we know who the user is before fetching (so we can decide
      // ownership + show the right empty state).
      if (status === "unauthenticated") {
        setLoadingProp(false);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingProp(true);
      try {
        const prop = await apiFetch<PropertyDTO>(`/api/properties/${propertyId}`);
        if (cancelled) return;
        const isOwner = session?.user?.id === prop.userId;
        const isAdmin = session?.user?.role === "ADMIN";
        if (!isOwner && !isAdmin) {
          setNotAllowed(true);
          setLoadingProp(false);
          return;
        }
        setForm({
          title: prop.title,
          type: prop.type,
          address: prop.address,
          area: prop.area,
          cityZone: prop.cityZone,
          price: String(prop.price),
          rooms: String(prop.rooms),
          size: prop.size != null ? String(prop.size) : "",
          amenities: prop.amenities,
          description: prop.description,
          latitude: prop.latitude != null ? String(prop.latitude) : "",
          longitude: prop.longitude != null ? String(prop.longitude) : "",
        });
        // Pre-populate photos from existing image URLs (sorted by position — the
        // backend returns images ordered by position ASC).
        const sortedImages = [...prop.images].sort((a, b) => a.position - b.position);
        setPhotos(
          sortedImages.map((img) => ({
            id: genId(),
            url: img.url,
            localPreview: null,
            status: "done" as const,
            fileName: img.url.split("/").pop() ?? "image",
            fileSize: 0,
          }))
        );
        setLoadingProp(false);
      } catch (e) {
        if (cancelled) return;
        setLoadingProp(false);
        // 404 means "doesn't exist OR not yours" — show the "not allowed" state.
        setNotAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, propertyId, status, session]);

  // ---- Field helpers
  const setField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setAiResult(null);
      setForm((s) => ({ ...s, [field]: value }));
      setErrorFields((prev) => ({ ...prev, [field]: undefined }));
    },
    []
  );

  const toggleAmenity = useCallback((key: AmenityKey) => {
    setAiResult(null);
    setForm((s) => {
      const has = s.amenities.includes(key);
      return {
        ...s,
        amenities: has ? s.amenities.filter((a) => a !== key) : [...s.amenities, key],
      };
    });
    setErrorFields((prev) => ({ ...prev, amenities: undefined }));
  }, []);

  const registerFieldRef = (field: FieldKey) => (el: HTMLElement | null) => {
    fieldRefs.current[field] = el;
  };

  // ---- Photo upload
  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setErrorFields((prev) => ({ ...prev, photos: undefined }));

    // Pre-check size and type before kicking off uploads.
    const valid: File[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        toast.error(`"${f.name}" is not an image (only image files are accepted)`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" is larger than 10 MB`);
        continue;
      }
      valid.push(f);
    }

    // Compress each file client-side (canvas re-encode). This shrinks large
    // phone photos (2-8 MB) down to a few hundred KB BEFORE they hit the
    // network, so they pass through preview-gateway body-size limits that
    // would otherwise drop the connection ("Failed to fetch"). Files under
    // 300 KB are passed through untouched to avoid quality loss.
    const compressed = await Promise.all(valid.map((f) => compressImage(f)));

    // Append new entries with local previews in "uploading" state. Use the
    // original file for the preview (instant) but the compressed file for
    // the upload (smaller). Show the post-compression size so the user sees
    // the real bytes going to the server.
    const newItems: PhotoItem[] = compressed.map((f, i) => ({
      id: genId(),
      url: null,
      localPreview: URL.createObjectURL(valid[i]),
      status: "uploading",
      fileName: f.name,
      fileSize: f.size,
      file: f,
    }));
    setPhotos((p) => [...p, ...newItems]);

    // Upload each file in parallel; update its slot when done.
    await Promise.all(
      newItems.map(async (item) => {
        try {
          const url = await uploadFile(item.file as File);
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, url, status: "done" } : p
            )
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          toast.error(`"${item.fileName}" upload failed: ${msg}`);
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, status: "error", errorMsg: msg } : p
            )
          );
        } finally {
          // Drop the File reference once the upload resolves (success or fail)
          // so the GC can reclaim it. The localPreview stays for instant UX.
          setPhotos((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, file: undefined } : p))
          );
        }
      })
    );
  }, []);

  const retryPhoto = useCallback(async (id: string) => {
    const item = photos.find((p) => p.id === id);
    if (!item || !item.file) {
      toast.error("Original file is no longer available — please re-add it.");
      return;
    }
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "uploading", errorMsg: undefined } : p))
    );
    try {
      // Re-compress on retry too (defensive — file is already compressed in
      // the normal path, but this covers the edit-mode pre-populated case
      // where `file` is undefined and the user re-added from disk).
      const fileToUpload = await compressImage(item.file);
      const url = await uploadFile(fileToUpload);
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, url, status: "done", file: undefined } : p))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(`Retry failed: ${msg}`);
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "error", errorMsg: msg } : p))
      );
    }
  }, [photos]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.localPreview) URL.revokeObjectURL(target.localPreview);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const movePhoto = useCallback((id: string, dir: -1 | 1) => {
    setPhotos((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const next = Math.min(prev.length - 1, Math.max(0, idx + dir));
      if (next === idx) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(next, 0, moved);
      return copy;
    });
  }, []);

  const onBrowseClick = () => fileInputRef.current?.click();

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void addFiles(e.target.files);
    }
    // Reset so the same file can be re-added later if needed.
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files);
    }
  };

  // ---- AI fair-price suggestion
  const handleSuggestPrice = async () => {
    if (aiLoading) return;
    // Required: type, cityZone, rooms. (Area is sent too for context.)
    if (!form.type || !form.cityZone || form.rooms === "") {
      toast.error("Fill type, city & rooms first");
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const body = {
        propertyId: mode === "edit" ? propertyId : undefined,
        type: form.type,
        cityZone: form.cityZone,
        area: form.area.trim() || "Gilgit-Baltistan",
        rooms: Number(form.rooms),
        size: form.size ? Number(form.size) : null,
        amenities: form.amenities,
      };
      const res = await apiFetch<PricePredictionResponse>("/api/ai/predict-price", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAiResult(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 502) {
        toast.error("AI estimate unavailable");
      } else {
        toast.error("AI estimate unavailable");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const useSuggestedPrice = () => {
    if (!aiResult?.available) return;
    setField("price", String(aiResult.predictedPrice));
    setAiResult(null);
    toast.success(`Price set to PKR ${aiResult.predictedPrice.toLocaleString()}`);
  };

  // ---- Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const donePhotos = photos.filter((p) => p.status === "done");
    const errors = validate(form, donePhotos.length);
    if (errors.length > 0) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const err of errors) next[err.field] = err.message;
      setErrorFields(next);
      toast.error(errors[0].message);
      const firstField = errors[0].field;
      const el = fieldRefs.current[firstField];
      if (el) {
        // Defer focus so the new error UI paints first.
        setTimeout(() => {
          el.focus?.();
          el.scrollIntoView?.({ behavior: "smooth", block: "center" });
        }, 0);
      }
      return;
    }
    setErrorFields({});
    setSubmitting(true);
    try {
      const body: PropertyInput = {
        title: form.title.trim(),
        type: form.type as PropertyType,
        address: form.address.trim(),
        area: form.area.trim(),
        cityZone: form.cityZone as CityZone,
        price: Math.round(Number(form.price)),
        rooms: Math.round(Number(form.rooms)),
        size: form.size ? Number(form.size) : null,
        amenities: form.amenities,
        description: form.description.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        images: donePhotos.map((p) => p.url).filter((u): u is string => Boolean(u)),
      };
      if (mode === "edit" && propertyId) {
        await apiFetch<PropertyDTO>(`/api/properties/${propertyId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        // Non-admin edits reset status to PENDING on the server.
        const isAdmin = session?.user?.role === "ADMIN";
        if (isAdmin) {
          toast.success("Listing updated.");
        } else {
          toast.warning("Listing updated — it's now pending re-approval by an admin.");
        }
        go({ name: "dashboard" });
      } else {
        await apiFetch<PropertyDTO>("/api/properties", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setShowSuccess(true);
        // Brief success state, then navigate.
        setTimeout(() => go({ name: "dashboard" }), 1400);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not save listing. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render: gate states first.

  // Auth gate: loading session → small spinner.
  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  // Auth gate: unauthenticated → centered sign-in Card.
  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-xl">Sign in required</CardTitle>
            <CardDescription className="text-center">
              Please sign in to list a property.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button className="w-full" onClick={() => openAuth("login")}>
              Sign in
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => go({ name: "home" })}
            >
              Back to browse
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Edit mode: still loading the property.
  if (loadingProp) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading listing…
        </div>
      </div>
    );
  }

  // Edit mode: not allowed / not found.
  if (notAllowed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={AlertCircle}
          title="Not allowed"
          description="This listing doesn't exist, or you don't have permission to edit it."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => back()}>
                <ArrowLeft className="size-4" /> Go back
              </Button>
              <Button onClick={() => go({ name: "dashboard" })}>
                Go to dashboard
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // Success state (after create).
  if (showSuccess) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Check className="size-7" />
            </div>
            <CardTitle className="text-xl">Listing created!</CardTitle>
            <CardDescription>
              Your property has been submitted and is now pending admin approval.
              You'll see it in your dashboard once it goes live.
            </CardDescription>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Redirecting to dashboard…
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Main render.
  const doneCount = photos.filter((p) => p.status === "done").length;
  const uploadingCount = photos.filter((p) => p.status === "uploading").length;
  const errorCount = photos.filter((p) => p.status === "error").length;
  const overallProgress =
    photos.length > 0 ? Math.round((doneCount / photos.length) * 100) : 0;

  const inputCls = (field: FieldKey) =>
    cn(errorFields[field] && "border-destructive aria-invalid:border-destructive");

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6 sm:pb-12">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-muted-foreground"
            onClick={() => back()}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {mode === "edit" ? "Edit listing" : "List a new property"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "edit"
            ? "Update your property details. Edits are re-checked by an admin before going live again."
            : "Tell renters about your space. New listings are reviewed by an admin before they appear publicly."}
        </p>
      </header>

      <form id="create-edit-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* ---------- Basic details ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic details</CardTitle>
            <CardDescription>The essentials renters see first.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                ref={registerFieldRef("title") as React.Ref<HTMLInputElement>}
                value={form.title}
                maxLength={MAX_TITLE}
                placeholder="e.g. Spacious 3-bed house in Karimabad"
                aria-invalid={!!errorFields.title}
                aria-describedby={errorFields.title ? "title-error" : undefined}
                className={inputCls("title")}
                onChange={(e) => setField("title", e.target.value)}
              />
              <div className="flex items-center justify-between text-xs">
                <span id="title-error" className="text-destructive">
                  {errorFields.title ?? ""}
                </span>
                <span className="text-muted-foreground">
                  {form.title.length}/{MAX_TITLE}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>
                Property type <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={form.type}
                onValueChange={(v) => setField("type", v as PropertyType)}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                ref={registerFieldRef("type") as React.Ref<HTMLDivElement>}
                aria-invalid={!!errorFields.type}
              >
                {PROPERTY_TYPES.map((t) => (
                  <label
                    key={t}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-accent",
                      form.type === t
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-input"
                    )}
                  >
                    <RadioGroupItem value={t} id={`type-${t}`} />
                    <span className="font-medium">{PROPERTY_TYPE_LABEL[t]}</span>
                  </label>
                ))}
              </RadioGroup>
              {errorFields.type && (
                <p className="text-xs text-destructive">{errorFields.type}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="address">
                Street address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="address"
                ref={registerFieldRef("address") as React.Ref<HTMLInputElement>}
                value={form.address}
                placeholder="e.g. Main Bazaar Road, near Baltit Fort"
                aria-invalid={!!errorFields.address}
                aria-describedby={errorFields.address ? "address-error" : undefined}
                className={inputCls("address")}
                onChange={(e) => setField("address", e.target.value)}
              />
              {errorFields.address && (
                <p id="address-error" className="text-xs text-destructive">
                  {errorFields.address}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="area">
                  Area / neighbourhood <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="area"
                  ref={registerFieldRef("area") as React.Ref<HTMLInputElement>}
                  value={form.area}
                  placeholder="e.g. Karimabad, Konodas"
                  aria-invalid={!!errorFields.area}
                  aria-describedby={errorFields.area ? "area-error" : undefined}
                  className={inputCls("area")}
                  onChange={(e) => setField("area", e.target.value)}
                />
                {errorFields.area && (
                  <p id="area-error" className="text-xs text-destructive">
                    {errorFields.area}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="cityZone">
                  City zone <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.cityZone}
                  onValueChange={(v) => setField("cityZone", v as CityZone)}
                >
                  <SelectTrigger
                    id="cityZone"
                    ref={registerFieldRef("cityZone") as React.Ref<HTMLButtonElement>}
                    className={cn("w-full", inputCls("cityZone"))}
                    aria-invalid={!!errorFields.cityZone}
                  >
                    <SelectValue placeholder="Pick a city / valley" />
                  </SelectTrigger>
                  <SelectContent>
                    {CITY_ZONES.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errorFields.cityZone && (
                  <p className="text-xs text-destructive">{errorFields.cityZone}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------- Pricing ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pricing &amp; size</CardTitle>
            <CardDescription>
              Set a fair monthly rent. Use the AI suggester if you're unsure.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">
                Monthly rent (PKR) <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Input
                    id="price"
                    type="number"
                    inputMode="numeric"
                    min={MIN_PRICE}
                    step={500}
                    ref={registerFieldRef("price") as React.Ref<HTMLInputElement>}
                    value={form.price}
                    placeholder="e.g. 35000"
                    aria-invalid={!!errorFields.price}
                    aria-describedby={errorFields.price ? "price-error" : "price-hint"}
                    className={cn("pr-28", inputCls("price"))}
                    onChange={(e) => {
                      setField("price", e.target.value);
                      // Clear stale AI suggestion if the user edits the price.
                      if (aiResult) setAiResult(null);
                    }}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <PriceTag
                      price={Number(form.price) || 0}
                      className="text-sm text-primary"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  onClick={handleSuggestPrice}
                  disabled={aiLoading}
                  className="gap-2 self-start whitespace-nowrap sm:self-auto"
                >
                  {aiLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4 text-amber-600" />
                  )}
                  Suggest fair price
                </Button>
              </div>
              <p id="price-hint" className="text-xs text-muted-foreground">
                Live preview: {form.price ? formatPKRFull(Number(form.price)) : "PKR —"}
              </p>
              {errorFields.price && (
                <p id="price-error" className="text-xs text-destructive">
                  {errorFields.price}
                </p>
              )}

              {/* AI callout */}
              {aiResult && !aiResult.available && <p role="status" className="text-sm text-muted-foreground">{aiResult.explanation}</p>}
              {aiResult?.available && (
                <div
                  className="mt-1 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:bg-amber-900/20"
                  role="status"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="size-4 text-amber-600 dark:text-amber-300" />
                    Suggested: {formatPKRFull(aiResult.predictedPrice)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Observed asking rents: {formatPKRFull(aiResult.low)} – {formatPKRFull(aiResult.high)}
                    {" · "}
                    Evidence: {aiResult.evidence} ({aiResult.comparables.length} listings)
                  </p>
                  {aiResult.explanation && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {aiResult.explanation}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={useSuggestedPrice}
                      className="gap-1"
                    >
                      <Check className="size-3.5" /> Use suggested price
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAiResult(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="rooms">
                  Number of rooms <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rooms"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_ROOMS}
                  step={1}
                  ref={registerFieldRef("rooms") as React.Ref<HTMLInputElement>}
                  value={form.rooms}
                  placeholder="e.g. 3"
                  aria-invalid={!!errorFields.rooms}
                  aria-describedby={errorFields.rooms ? "rooms-error" : undefined}
                  className={inputCls("rooms")}
                  onChange={(e) => setField("rooms", e.target.value)}
                />
                {errorFields.rooms && (
                  <p id="rooms-error" className="text-xs text-destructive">
                    {errorFields.rooms}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="size">Size (sq ft)</Label>
                <Input
                  id="size"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  ref={registerFieldRef("size") as React.Ref<HTMLInputElement>}
                  value={form.size}
                  placeholder="Optional, e.g. 900"
                  className={inputCls("size")}
                  aria-invalid={!!errorFields.size}
                  aria-describedby={errorFields.size ? "size-error" : undefined}
                  onChange={(e) => setField("size", e.target.value)}
                />
                {errorFields.size && (
                  <p id="size-error" className="text-xs text-destructive">
                    {errorFields.size}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------- Amenities ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Amenities</CardTitle>
            <CardDescription>
              Tick everything this listing offers. These feed the price model too.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div
              ref={registerFieldRef("amenities") as React.Ref<HTMLDivElement>}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {AMENITIES.map((a) => {
                const Icon = AMENITY_ICON[a.key];
                const checked = form.amenities.includes(a.key);
                return (
                  <label
                    key={a.key}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent",
                      checked
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-input"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleAmenity(a.key)}
                      aria-label={a.label}
                    />
                    <Icon className="size-4 text-primary" aria-hidden />
                    <span className="text-sm font-medium">{a.label}</span>
                  </label>
                );
              })}
            </div>
            {errorFields.amenities && (
              <p className="text-xs text-destructive">{errorFields.amenities}</p>
            )}
          </CardContent>
        </Card>

        {/* ---------- Description ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
            <CardDescription>
              Describe the space, neighbourhood, and any rules. Min {MIN_DESC} characters.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Textarea
              id="description"
              ref={registerFieldRef("description") as React.Ref<HTMLTextAreaElement>}
              value={form.description}
              rows={5}
              placeholder="e.g. Bright, airy house with a panoramic view of Rakaposhi. Walking distance to the bazaar…"
              aria-invalid={!!errorFields.description}
              aria-describedby={errorFields.description ? "description-error" : undefined}
              className={inputCls("description")}
              onChange={(e) => setField("description", e.target.value)}
            />
            <div className="flex items-center justify-between text-xs">
              <span id="description-error" className="text-destructive">
                {errorFields.description ?? ""}
              </span>
              <span className="text-muted-foreground">
                {form.description.length} characters
                {form.description.length < MIN_DESC && ` (need ${MIN_DESC})`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ---------- Location ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Location pin</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Optional — leave blank if unknown.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                min={-90}
                max={90}
                ref={registerFieldRef("latitude") as React.Ref<HTMLInputElement>}
                value={form.latitude}
                placeholder="e.g. 36.3265"
                className={inputCls("latitude")}
                aria-invalid={!!errorFields.latitude}
                aria-describedby={errorFields.latitude ? "lat-error" : undefined}
                onChange={(e) => setField("latitude", e.target.value)}
              />
              {errorFields.latitude && (
                <p id="lat-error" className="text-xs text-destructive">
                  {errorFields.latitude}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                min={-180}
                max={180}
                ref={registerFieldRef("longitude") as React.Ref<HTMLInputElement>}
                value={form.longitude}
                placeholder="e.g. 74.6589"
                className={inputCls("longitude")}
                aria-invalid={!!errorFields.longitude}
                aria-describedby={errorFields.longitude ? "lng-error" : undefined}
                onChange={(e) => setField("longitude", e.target.value)}
              />
              {errorFields.longitude && (
                <p id="lng-error" className="text-xs text-destructive">
                  {errorFields.longitude}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---------- Photos ---------- */}
        <Card
          ref={registerFieldRef("photos") as React.Ref<HTMLDivElement>}
          className={cn(errorFields.photos && "border-destructive")}
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Photos</CardTitle>
                <CardDescription>
                  At least 1 photo. The first photo is the cover.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1">
                <ImageIcon className="size-3" />
                {doneCount} photo{doneCount === 1 ? "" : "s"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-accent/40"
              )}
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="size-5" />
              </div>
              <p className="text-sm font-medium">
                Drag and drop images here, or
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBrowseClick}
                className="gap-1"
              >
                <Upload className="size-3.5" /> Browse files
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP or GIF up to 10 MB each. Large photos are auto-compressed on upload.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={onFileInputChange}
                aria-label="Upload property photos"
              />
            </div>

            {/* Overall upload progress */}
            {uploadingCount > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Uploading {uploadingCount} of {photos.length}…
                  </span>
                  <span>{overallProgress}%</span>
                </div>
                <Progress value={overallProgress} className="h-1.5" />
              </div>
            )}

            {errorFields.photos && (
              <p className="text-xs text-destructive">{errorFields.photos}</p>
            )}

            {/* Thumbnail grid */}
            {photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p, idx) => (
                  <li
                    key={p.id}
                    className="group relative overflow-hidden rounded-md border bg-muted"
                  >
                    <div className="aspect-square w-full">
                      {/* Plain <img> is intentional here: the URLs are user-uploaded
                          and the aspect-square crop is trivial — next/image's
                          remotePatterns config would be overkill for the sandbox. */}
                      <img
                        src={p.url ?? p.localPreview ?? ""}
                        alt={p.fileName}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Order badge */}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur">
                      {idx + 1}
                    </span>

                    {/* Status overlay */}
                    {p.status === "uploading" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 text-center backdrop-blur-sm">
                        <Loader2 className="size-4 animate-spin text-primary" />
                        <span className="text-[10px] font-medium">Uploading…</span>
                      </div>
                    )}
                    {p.status === "error" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-destructive/10 text-center">
                        <AlertCircle className="size-4 text-destructive" />
                        <span className="px-1 text-[10px] font-medium text-destructive">
                          Failed
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[10px]"
                          onClick={() => retryPhoto(p.id)}
                        >
                          <RotateCw className="size-3" /> Retry
                        </Button>
                      </div>
                    )}

                    {/* Hover actions */}
                    {p.status === "done" && (
                      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="size-7 rounded-full bg-background/90 shadow-sm"
                            disabled={idx === 0}
                            onClick={() => movePhoto(p.id, -1)}
                            aria-label="Move photo left"
                          >
                            <ChevronUp className="size-3.5 rotate-[-90deg]" />
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="size-7 rounded-full bg-background/90 shadow-sm"
                            disabled={idx === photos.length - 1}
                            onClick={() => movePhoto(p.id, 1)}
                            aria-label="Move photo right"
                          >
                            <ChevronDown className="size-3.5 rotate-[-90deg]" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="size-7 rounded-full bg-background/90 text-destructive shadow-sm hover:text-destructive"
                          onClick={() => removePhoto(p.id)}
                          aria-label="Remove photo"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {errorCount > 0 && (
              <div className="text-xs text-destructive" role="alert">
                <p>{errorCount} upload{errorCount === 1 ? "" : "s"} failed.</p>
                <ul>{photos.filter(p => p.status === "error").map(p => <li key={p.id}>{p.fileName}: {p.errorMsg || "Upload failed. Please retry."}</li>)}</ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------- Desktop submit row ---------- */}
        <div className="hidden items-center justify-end gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            onClick={() => back()}
            disabled={submitting}
            className="gap-1"
          >
            <ArrowLeft className="size-4" /> Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || uploadingCount > 0}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {mode === "edit" ? "Save changes" : "Publish listing"}
          </Button>
        </div>
      </form>

      {/* ---------- Mobile sticky submit bar ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-edit-form"
            disabled={submitting || uploadingCount > 0}
            className="flex-1 gap-2"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {mode === "edit" ? "Save" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
