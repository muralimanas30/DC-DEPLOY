const { SOCKET_EVENTS, ROOMS } = require("../socket");

describe("socket location event contract", () => {
    test("exports expected location event names", () => {
        expect(SOCKET_EVENTS.CLIENT_LOCATION_UPDATE).toBe("location:update");
        expect(SOCKET_EVENTS.PARTICIPANT_LOCATION_UPDATE).toBe("incident:participant-location");
    });

    test("incident room helper returns deterministic room key", () => {
        expect(ROOMS.incident("abc123")).toBe("incident:abc123");
    });

    test("location event payload shape remains compatible", () => {
        const payload = {
            incidentId: "incident-1",
            userId: "user-1",
            name: "Responder",
            role: "volunteer",
            location: { lng: 78.4867, lat: 17.385 },
            timestamp: new Date().toISOString(),
        };

        expect(payload).toEqual(
            expect.objectContaining({
                incidentId: expect.any(String),
                userId: expect.any(String),
                name: expect.any(String),
                role: expect.any(String),
                location: expect.objectContaining({
                    lng: expect.any(Number),
                    lat: expect.any(Number),
                }),
                timestamp: expect.any(String),
            })
        );
    });
});
