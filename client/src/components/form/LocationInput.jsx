"use client";
export default function LocationInput({ coordinates, onChange }) {
    return (
        <div className="mb-2 flex gap-2">
            <div>
                <label className="label">Latitude</label>
                <input
                    className="input input-bordered w-full"
                    name="latitude"
                    type="number"
                    value={coordinates[0]}
                    onChange={onChange}
                    step="any"
                    required
                    autoFocus
                />
            </div>
            <div>
                <label className="label">Longitude</label>
                <input
                    className="input input-bordered w-full"
                    name="longitude"
                    type="number"
                    value={coordinates[1]}
                    onChange={onChange}
                    step="any"
                    required
                />
            </div>
        </div>
    );
}
