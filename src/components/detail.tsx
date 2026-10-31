"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Media, Price, Stars } from "./cards";
import { Alert, Badge, Button, ErrorBox, Img, Spinner } from "./ui";
import { api } from "@/lib/ui/api";
import { useAction, useApi, useAuth } from "@/lib/ui/hooks";
import { day } from "@/lib/ui/format";

interface Detail { id: string; name: string; slug: string; description?: string; shortDescription?: string; media: Media[]; pricing: { price: number; finalPrice: number; discountType: string; discountValue: number }; category?: { name: string; slug: string }; rating: { count: number; average: number | null }; [k: string]: unknown }
interface Reviews { items: { id: string; rating: number; title?: string; comment?: string; images?: { url: string }[]; verifiedPurchase: boolean; createdAt: string }[]; total: number }

export default function DetailPage({ kind }: { kind: "pets" | "products" }) {
  const { slug } = useParams<{ slug: string }>();
  const { data: d, loading, error, reload } = useApi<Detail>(`/api/${kind}/${slug}`);
  const reviews = useApi<Reviews>(d ? `/api/reviews?targetType=${kind === "pets" ? "pet" : "product"}&targetId=${d.id}` : null);
  const { me, refreshCart } = useAuth();
  const router = useRouter(), path = usePathname();
  const { busy, run } = useAction();
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  if (loading) return <Spinner />;
  if (error || !d) return <ErrorBox msg={error ?? "Not found"} retry={reload} />;
  const images = d.media.filter((m) => m.kind === "image");
  const unavailable = kind === "pets" ? d.availability !== "available" : d.stockStatus === "out_of_stock";
  const add = async () => {
    if (!me) { router.push(`/login?next=${encodeURIComponent(path)}`); return; }
    const ok = await run(() => api("/api/me/cart/items", { method: "POST", body: kind === "pets" ? { itemType: "pet", petId: d.id } : { itemType: "product", productId: d.id, quantity: qty } }), "Added to cart");
    if (ok) await refreshCart();
  };
  return (
    <div className="col">
      <div className="small muted"><Link href="/">Home</Link> / <Link href={`/${kind}`}>{kind === "pets" ? "Pets" : "Accessories"}</Link>{d.category && <> / <Link href={`/${kind}?category=${d.category.slug}`}>{d.category.name}</Link></>}</div>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="gallery">
          <Img src={images[img]?.url} alt={images[img]?.alt || d.name} className="main" />
          {images.length > 1 && <div className="thumbs">{images.map((m, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={m.url} src={m.url} alt={`${d.name} ${i + 1}`} className={i === img ? "on" : ""} onClick={() => setImg(i)} />)}</div>}
        </div>
        <div className="col">
          <h1>{d.name}</h1><Stars r={d.rating} />
          <Price p={d.pricing} />
          {d.shortDescription && <p>{d.shortDescription}</p>}
          {kind === "pets" ? (
            <div className="card col small">
              <div className="row"><Badge status={String(d.availability)} /> <span>{String(d.type)} · {String(d.breed ?? "")} · {String(d.gender ?? "")} · {String(d.color ?? "")}</span></div>
              {d.dateOfBirth ? <div>Born {day(String(d.dateOfBirth))}</div> : null}
              {d.vaccinationStatus ? <div>Vaccination: <strong>{String(d.vaccinationStatus)}</strong></div> : null}
              {d.healthDisclosure ? <div>Health: {String(d.healthDisclosure)}</div> : null}
            </div>
          ) : (
            <div className="card col small">{d.brand ? <div>Brand: <strong>{String(d.brand)}</strong></div> : null}{Array.isArray(d.compatibility) ? <div>Suitable for: {(d.compatibility as string[]).join(" & ")}</div> : null}<div>Availability: <Badge status={String(d.stockStatus)} /></div></div>
          )}
          {unavailable ? <Alert kind="warn">{kind === "pets" ? "This pet is currently reserved or unavailable." : "Currently out of stock."}</Alert> : (
            <div className="row">{kind === "products" && <div className="qty"><button aria-label="Decrease" onClick={() => setQty(Math.max(1, qty - 1))}>−</button><span>{qty}</span><button aria-label="Increase" onClick={() => setQty(Math.min(20, qty + 1))}>+</button></div>}<Button busy={busy} onClick={add}>Add to cart</Button></div>
          )}
          {kind === "pets" && <p className="small muted">Live animals are not returnable through the online form; contact support for any concern within 48 hours of delivery.</p>}
        </div>
      </div>
      {kind === "pets" && Array.isArray(d.extraDescriptions) && (d.extraDescriptions as { shortDescription?: string; description?: string }[]).map((x, i) => <div key={i} className="card">{x.shortDescription && <h3>{x.shortDescription}</h3>}{x.description && <p style={{ whiteSpace: "pre-wrap" }}>{x.description}</p>}</div>)}
      {kind === "pets" && Array.isArray(d.customDetails) && d.customDetails.length > 0 && <div className="card"><h2>Pet details</h2>{(d.customDetails as { name: string; value: string }[]).map((x, i) => <p key={i} style={{ margin: "4px 0" }}><strong>{x.name}:</strong> {x.value}</p>)}</div>}
      {d.description && <div className="card"><h2>About</h2><p style={{ whiteSpace: "pre-wrap" }}>{d.description}</p>{kind === "pets" && d.careInfo ? <><h3>Care tips</h3><p style={{ whiteSpace: "pre-wrap" }}>{String(d.careInfo)}</p></> : null}</div>}
      <div className="card"><h2>Reviews {reviews.data ? `(${reviews.data.total})` : ""}</h2>
        {reviews.data?.items.length ? reviews.data.items.map((r) => <div key={r.id} className="mb"><div className="row"><strong>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</strong>{r.title && <strong>{r.title}</strong>}{r.verifiedPurchase && <span className="badge ok">Verified purchase</span>}</div>{r.comment && <p>{r.comment}</p>}{r.images?.length ? <div className="row">{r.images.map((im) => <Img key={im.url} src={im.url} alt="Review photo" className="" />)}</div> : null}<span className="small muted">{day(r.createdAt)}</span></div>) : <p className="muted">No reviews yet.</p>}
      </div>
    </div>
  );
}
