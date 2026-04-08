# Backend Features and End-to-End Flows

This document explains the major backend features implemented in the Node.js server, with each feature described as a complete flow from request entry to system outcome.

## 1) Server Bootstrap, Readiness, and Request Pipeline

Flow:
1. The runtime starts in `server.js`, creates the HTTP server, initializes Socket.IO, and waits for readiness before listening.
2. `app.js` performs startup dependencies in sequence:
   - Connects MongoDB (`db/connect.js`).
   - Runs SMS gateway startup readiness checks (`logSmsStartupReadiness`).
3. Middleware stack is initialized:
   - CORS allowlist parsing from environment.
   - JSON parser with raw-body capture for webhook signature validation.
   - Trace ID middleware (`x-trace-id`) for end-to-end observability.
   - Environment-specific request logging via Morgan.
4. API routes are mounted under `/api`.
5. Any thrown error is normalized by centralized error handler and returned with status, code, message, timestamp, and traceId.

Outcome:
- The backend only accepts traffic after DB and core notification dependencies are ready.
- Every request is traceable and returns a consistent response shape.

## 2) Authentication and Token Issuance (Credentials + OAuth)

Flow:
1. Client calls `/api/auth/register`, `/api/auth/login`, `/api/auth/oauth`, or `/api/auth/check`.
2. Register flow:
   - Validates mandatory credentials and role selection.
   - Normalizes optional phone number (Indian 10-digit validation).
   - Creates user with roles and activeRole.
   - Password is automatically hashed by model pre-save hook.
   - Sends non-blocking account-created notification.
   - Issues JWT token.
3. Login flow:
   - Validates email/password.
   - Blocks password login for OAuth-only accounts.
   - Tracks failed-login spikes per user+IP and sends security email alerts.
   - Detects new-device/network login fingerprint and sends security notice email.
   - Issues JWT token on success.
4. OAuth flow:
   - Validates provider payload.
   - Blocks mixed-auth collision (same email with credentials account).
   - Creates first-time OAuth user when needed.
   - Sends account-created notification for new OAuth users.
   - Issues JWT token.
5. Check-user flow returns whether account exists and provider info.

Outcome:
- Unified authentication supports both credentials and OAuth with explicit conflict protection and security notifications.

## 3) Authorization and Identity Resolution

Flow:
1. Protected routes require `Authorization: Bearer <token>`.
2. `authMiddleware` verifies JWT and injects `req.user` and `req.userId`.
3. Service layer re-resolves current user from DB (by id or fallback email) for fresh role/access decisions.
4. Business authorization checks are applied per feature:
   - Admin-only operations (clear DB, SMS test, force close, assignment management).
   - Incident member-only operations (chat send, participant view, logs).
   - Closed incident visibility restrictions.

Outcome:
- Route protection is token-based, and critical decisions rely on current database state, not stale client assumptions.

## 4) User Profile, Role Switching, and Account Safety

Flow:
1. User calls `/api/user/update` (or `/api/user/update/:id`) with profile changes.
2. Update service resolves valid candidate user IDs and loads the user record.
3. Allowed field updates include location, online presence, skills, and phone.
4. Phone updates are normalized/validated before persistence.
5. Role switching (`activeRole`) checks:
   - Must be one of victim/volunteer/admin.
   - Blocked while the user is assigned to an active incident.
   - Selected role is auto-included in roles array if missing.
6. Password update checks:
   - Not allowed for OAuth users.
   - Enforces minimum password length.

Outcome:
- Profile updates are flexible but lifecycle-safe; role/credential changes cannot violate incident participation rules.

## 5) Incident Creation and Ownership Model

Flow:
1. Authenticated user calls `POST /api/incidents` with title, description, and optional metadata.
2. Service validates required fields and fetches creator user.
3. For victim users:
   - Prevents creating another active incident if already assigned.
   - Auto-cleans stale assignment references if previous incident is closed/missing.
4. Location is normalized from payload or inherited from creator current location.
5. Incident is created with role-aware initial participants:
   - Victim creator -> in `victims`.
   - Volunteer creator -> in `volunteers`.
   - Admin creator -> in `admins`.
6. Victim creator gets `assignedIncident` updated to new incident.
7. Real-time event `incident:changed` is emitted to subscribed clients.
8. Non-blocking notification pipeline triggers incident-created updates.

Outcome:
- Incident onboarding is role-aware, location-aware, and immediately synchronized to real-time clients.

## 6) Incident Listing, Detail Visibility, and Operational Views

Flow:
1. List endpoint `GET /api/incidents` supports pagination and filters (status, severity, category, createdByMe).
2. `assignedOnly=true` mode returns only the user's currently assigned active incident.
3. Stale assignment references are auto-cleared if linked incident is closed or missing.
4. Detail endpoint `GET /api/incidents/:incidentId` enforces closed-incident visibility:
   - Closed incidents are visible only to creator, participants, or platform admin.
5. Participant endpoint `GET /:incidentId/participants`:
   - Requires user to be creator/participant/platform admin.
   - Returns grouped victims, volunteers, admins.
6. Available-volunteers endpoint `GET /:incidentId/available-volunteers`:
   - Admin-only visibility.
   - Returns only volunteer users not currently assigned and not already in incident.

Outcome:
- Incident data surfaces are optimized for dashboards/admin workflows while preserving strict visibility rules.

## 7) Participation, Assignment, and Auto-Close Logic

Flow:
1. Join flow `POST /:incidentId/join`:
   - Validates user/incident.
   - Blocks joining when user is assigned to another active incident.
   - Moves user into role-specific participant array.
   - Normalizes participant arrays and updates assignment.
2. Leave flow `POST /:incidentId/leave`:
   - Removes user from all participant arrays.
   - Clears assignment when leaving current incident.
3. Assign flow `POST /:incidentId/assign`:
   - Admin-only (incident admin or platform admin).
   - Validates target user and assignment conflicts.
   - Places target in role-specific participant array.
4. Unassign flow `DELETE /:incidentId/assign/:userId`:
   - Admin-only.
   - Removes target from participant arrays and clears assignment.
5. Critical normalization behavior:
   - If no victims remain, incident auto-closes.
   - Participants are cleared and assignment links are reset.
6. Side effects:
   - Emits real-time incident change events.
   - Sends role/lifecycle notifications (joined, left, assigned, unassigned).
   - Sends admin audit notifications for reassignment actions.

Outcome:
- Participation orchestration stays consistent across user roles and prevents invalid multi-incident assignments.

## 8) Incident Resolution and Force-Close

Flow:
1. Resolve endpoint `PATCH /:incidentId/resolve` verifies incident and current user permissions.
2. Standard resolve (participant/self flow):
   - Removes actor from participant arrays.
   - If no victims remain, incident auto-closes and all assignments are cleared.
   - Otherwise incident remains active and actor assignment is cleared.
3. Force-close path:
   - Triggered by admin via `force=true` or `/force-close` endpoint.
   - Clears all participant arrays and marks incident closed immediately.
4. Emits closure/resolve real-time events.
5. Sends incident-resolved notifications to previous participants/victims.

Outcome:
- Resolution supports both normal participant exits and explicit administrative force-closure without leaving stale assignments.

## 9) Real-Time Layer: Socket Rooms, Live Location, and Alert Broadcasting

Flow:
1. Socket connection requires JWT in handshake auth/header.
2. Server resolves live user from DB and joins global incidents room.
3. Incident watch/unwatch events control per-incident room membership.
4. Location update flow (`location:update`):
   - Validates lat/lng bounds.
   - Persists user live location and lastSeen.
   - Emits `incident:participant-location` to incident room for active incidents.
5. Alert flow (`sendAlert`):
   - Validates incident state and participant permissions.
   - Enforces role-based allowed alert types.
   - Persists alert as chat message.
   - Broadcasts both high-level alert event and chat-message event.

Outcome:
- Clients receive low-latency updates for team movement, alerts, and incident state changes using role-aware room permissions.

## 10) Incident Chat and REST Alert APIs

Flow:
1. Chat list `GET /:incidentId/chat`:
   - Participant/admin-only visibility.
   - Active incidents only.
   - Returns paginated newest-first message history.
2. Chat send `POST /:incidentId/chat`:
   - Participant/admin-only send permission.
   - Enforces non-empty and max-length body.
   - Persists `IncidentMessage` and broadcasts socket event.
3. Quick alert API `POST /:incidentId/chat/alert`:
   - Validates role-based alert permissions.
   - Persists alert-type chat message.
   - Broadcasts alert + chat events.
   - Triggers outbound notification helper for participants.

Outcome:
- Incident rooms support both conversational chat and structured emergency alerting with durable storage and real-time fan-out.

## 11) SMS Gateway Webhook Ingestion and Incident Auto-Creation

Flow:
1. Webhook endpoint `POST /api/sms/webhook` receives payload and raw body.
2. Signature validation:
   - Optional HMAC validation using `x-signature` + `x-timestamp` with drift checks.
   - Cloud mode allows optional signature behavior.
3. Payload normalization supports event-envelope and flat payload formats.
4. Inbound message processing (`sms:received`):
   - Normalizes sender phone when possible.
   - Parses structured `DC_REPORT` payload format when present.
   - Builds dedupe key and checks recent duplicate window.
   - Resolves sender to existing user or auto-created guest user.
   - Creates incident from inbound SMS and links sender.
   - Persists inbound SMS record with metadata.
5. Status event processing (`sms:sent`, `sms:delivered`, `sms:failed`):
   - Locates outbound SMS record by provider message ID or recipient fallback.
   - Updates record status and event metadata.
6. Returns 2xx-style success payloads for accepted/duplicate/status/ignored events to reduce retry storms.

Outcome:
- The system can convert inbound mobile SMS traffic into structured incidents with dedupe safety and lifecycle traceability.

## 12) Outbound Notification Engine (SMS + Email)

Flow:
1. Notification helper builds compact, context-aware incident messages by event kind.
2. SMS dispatch path:
   - Creates queued outbound `SmsMessage` record first.
   - Calls SMS Gate provider (`/messages`) with auth mode (basic or bearer).
   - Updates message status (`sent`, `failed`, `simulated`) and provider metadata.
3. Email dispatch path:
   - Uses Nodemailer when SMTP is configured.
   - Falls back to simulated mode when SMTP is not configured.
4. Audience-dispatch helpers aggregate per-user SMS/email outcomes into summary metrics.
5. Trigger points include:
   - Account created.
   - Incident created.
   - Volunteer assigned/joined/left.
   - Quick alert.
   - Incident resolved.
   - Participant unassigned.
   - Admin audit actions.
6. Manual operations:
   - Admin SMS test endpoint for delivery validation.
   - Incident-specific SMS log retrieval for authorized viewers.

Outcome:
- Notification delivery is persistent, auditable, and resilient, with both real provider and simulation behaviors supported.

## 13) Admin Data Maintenance and Auditability

Flow:
1. Admin calls `POST /api/user/admin/clear-db` with strict confirmation text `CLEAR_DB`.
2. Backend revalidates requester from DB and requires current activeRole admin.
3. Deletes incident, incident-message, and SMS-message collections.
4. Preserves admin users (activeRole admin OR roles includes admin), plus requester as defensive fallback.
5. Deletes non-admin users and resets preserved admins to safe baseline state.
6. Logs server warning and sends admin audit notification email.

Outcome:
- Safe environment reset is possible without destroying administrative access, with explicit audit trail signaling.

## 14) Response Contract, Error Model, and Traceability

Flow:
1. Success responses use a shared helper with:
   - `status`, `statusCode`, `msg`, `data`, optional `meta`, `traceId`, `timestamp`.
2. Errors throw `AppError` with status/code/details.
3. Central handler maps all errors to a stable error payload with trace ID.
4. Logger categorizes by app/server/db/socket/webhook/notify/security for operational debugging.

Outcome:
- Frontend and observability tools receive predictable API structures and correlated trace context across both success and failure paths.

---

# Detailed Presentation Explanation (Speaker Notes)

Use this section as your presentation script.

## Presentation Narrative

Our backend is designed as a disaster-response orchestration engine that combines three channels into one system: web app actions, real-time socket collaboration, and inbound/outbound SMS operations.

The architecture starts with an Express API connected to MongoDB, and every request gets a trace ID for observability. Authentication supports both credentials and OAuth. After login, role-aware authorization rules decide what each user can do as a victim, volunteer, or admin.

The core domain is the incident lifecycle. A victim can create an incident with location context, and the system prevents invalid states like a victim creating multiple active incidents simultaneously. Incidents can be joined, left, assigned, or unassigned, and every transition emits real-time socket events so dashboards and map views stay in sync.

For real-time collaboration, Socket.IO uses JWT-authenticated rooms. Users subscribe to incident rooms, publish live location updates, and send predefined emergency alerts. These alerts are stored as chat messages and broadcast instantly to responders.

A key differentiator is SMS integration. The backend receives webhook events from SMS Gateway, validates signatures, normalizes payload formats, deduplicates inbound retries, and can auto-create incidents from SMS reports. This makes the platform useful even when users cannot directly access the web interface.

On the outbound side, the notification engine sends incident updates through SMS and email. It stores every outgoing SMS in a persistent log before provider delivery, then updates status from webhook feedback (`sent`, `delivered`, `failed`). If external services are not configured, the system enters simulation mode instead of failing hard, which keeps development and demos stable.

For governance, admin workflows include controlled database reset with confirmation token and preservation of admin accounts, plus audit notifications for sensitive actions like reassignment and clear-db.

Overall, this backend is not just CRUD APIs. It is an event-driven, role-aware coordination platform where incident state, responder actions, map tracking, messaging, and external SMS integration operate as one consistent flow.

## Suggested Demo Order for Presentation

1. Show `/api/health` and explain readiness checks (DB + SMS).
2. Register/login two users with different roles.
3. Create an incident and show participant auto-assignment.
4. Join/assign volunteer and show live incident updates.
5. Send chat message and alert, then show socket-driven updates.
6. Show map feed with tracked participants.
7. Trigger SMS webhook sample and show incident auto-creation + dedupe behavior.
8. Resolve or force-close incident and show lifecycle notifications.
9. Open SMS logs to prove auditability and status tracking.
10. Close by showing uniform success/error payload with trace IDs.

## Key Value Points to Emphasize

1. Multi-channel incident intake: web + SMS webhook.
2. Strong role-aware controls with operational guardrails.
3. Real-time collaboration for responders via sockets.
4. Persistent notification audit trail (SMS + email).
5. Fault-tolerant behavior through simulation modes and dedupe logic.
6. Production-oriented observability with trace IDs and structured responses.
