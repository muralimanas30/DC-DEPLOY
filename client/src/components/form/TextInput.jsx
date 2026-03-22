"use client";
export default function TextInput({ label, name, value, onChange, type = "text", ...props }) {
    return (
        <div className="mb-2">
            <label className="label">{label}</label>
            <input
                className="input input-bordered w-full"
                name={name}
                value={value}
                onChange={onChange}
                type={type}
                autoFocus
                {...props}
            />
        </div>
    );
}
