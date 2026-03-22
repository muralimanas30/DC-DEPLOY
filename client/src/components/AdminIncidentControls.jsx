"use client";

export default function AdminIncidentControls({
    detailId,
    assignUserId,
    setAssignUserId,
    unassignUserId,
    setUnassignUserId,
    onAssign,
    onUnassign,
    loading,
}) {
    if (!detailId) return null;

    return (
        <div className="mt-4 space-y-3">
            <div className="join w-full">
                <input
                    type="text"
                    className="input input-bordered join-item w-full"
                    placeholder="User ID to assign"
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                />
                <button
                    type="button"
                    className="btn btn-sm btn-primary join-item"
                    onClick={onAssign}
                    disabled={loading || !assignUserId.trim()}
                >
                    Assign
                </button>
            </div>

            <div className="join w-full">
                <input
                    type="text"
                    className="input input-bordered join-item w-full"
                    placeholder="User ID to unassign"
                    value={unassignUserId}
                    onChange={(e) => setUnassignUserId(e.target.value)}
                />
                <button
                    type="button"
                    className="btn btn-sm btn-warning join-item"
                    onClick={onUnassign}
                    disabled={loading || !unassignUserId.trim()}
                >
                    Unassign
                </button>
            </div>
        </div>
    );
}
