"use client";
import Link from "next/link";

export default function Breadcrumbs({ items }) {
  return (
    <div className="breadcrumbs text-sm">
      <ul>
        {items.map((item, idx) => (
          <li key={`${item.label}-${idx}`}>
            {item.href ? (
              <Link href={item.href} className="text-base-content/70 hover:text-primary">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-base-content">{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
