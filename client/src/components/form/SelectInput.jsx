"use client";
export default function SelectInput({ label, name, value, onChange, options, ...props }) {
    return (
        <div className="mb-2">
            <label className="label">{label}</label>
            <select
                className="select select-bordered w-full"
                name={name}
                value={value}
                onChange={onChange}
                autoFocus
                {...props}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}
