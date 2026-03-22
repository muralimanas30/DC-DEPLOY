"use client";
import Link from "next/link";

export default function Breadcrumbs({ items }) {
  return (
    <div className="breadcrumbs mb-4">
      <ul>
        {items.map((item, idx) => (
          <li key={`${item.label}-${idx}`}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
