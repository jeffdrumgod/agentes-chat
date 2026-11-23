/** Approved transparent art for large decorative slots. Never replaces a person's small avatar. */
export function ProaArt({
  name = "timo-acenando",
  size = 128,
  className,
}: {
  name?: "dupla" | "timo-acenando" | "timo-headset" | "timo-luneta" | "facho-parado";
  size?: number;
  className?: string;
}) {
  const height = name === "dupla" ? Math.round((size * 2) / 3) : size;
  return (
    <img
      className={`proa-art${className ? ` ${className}` : ""}`}
      src={`/brand/3d/${name}.webp`}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={height}
      decoding="async"
      style={{ width: size, height, maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
