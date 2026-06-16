import { clsx } from "clsx";
import type { HTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { avatarStyleForName } from "../utils/avatar";
import { initials } from "../utils/format";

const sizeClasses = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-16 w-16 text-lg",
};

export function UserAvatar({
  avatarUrl,
  className,
  frame = true,
  name,
  size = "md",
  title,
  ...props
}: {
  avatarUrl?: string | null;
  className?: string;
  frame?: boolean;
  name: string;
  size?: keyof typeof sizeClasses;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(avatarUrl && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div
      {...props}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white",
        frame && "border-2 border-white shadow-sm",
        sizeClasses[size],
        className,
      )}
      style={showImage ? undefined : avatarStyleForName(name)}
      title={title ?? name}
    >
      {showImage ? (
        <img
          className="h-full w-full object-cover"
          src={avatarUrl ?? undefined}
          alt=""
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
