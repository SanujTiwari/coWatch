# coWatch

coWatch is a real-time hangout application for watching videos, chatting, and
joining audio/video calls in a shared room. The React frontend uses Socket.IO
for room events and WebRTC for browser-to-browser media. An Express API stores
users, room membership, messages, and playlists in PostgreSQL.

## Features

- Account registration, login, profile and email-based password reset.
- Private room tokens and invite links, room membership, chat, typing, and reactions.
- Shared playlists and host-only playback controls for YouTube and direct videos.
- Same-room message replies with recent history restored after reconnection.
- In-room camera, microphone, screen sharing, camera switching and participant tiles.
- Room-wide call invitations with accept, reject, cancellation and timeout states.
- Host/moderator removal, reinstatement, chat muting and voluntary microphone requests.
- Friend requests, blocking and reporting.

These features need deployment-specific and real-device validation before
production use; see the limitations below.

## Architecture

```text
client/                 React, Vite, Socket.IO client, WebRTC
  src/components/call/  Call controls and participant tiles
  src/components/media/ Media players
  src/hooks/            Room socket and WebRTC logic
  src/pages/            Application screens
server/                 Express API and Socket.IO signaling
  config/               Environment and PostgreSQL connection
  controllers/          API handlers
  middleware/           Authentication, validation and room access
  models/               Sequelize models and associations
  routes/               API routes
  services/             Socket events and room access checks
  migrations/           Reviewed SQL schema changes (not run automatically)
```

WebRTC uses a peer-to-peer mesh. Socket.IO relays signaling, not audio or video.
TURN credentials are generated on the server and expire; the shared TURN secret
must remain private.

## Setup

Requirements: Node.js 20.19 or newer, npm, PostgreSQL with verified TLS, and
HTTPS for camera/microphone access outside `localhost`. A TURN server is
recommended for users behind restrictive NATs or firewalls.

From the repository root in PowerShell:

```powershell
npm ci
npm ci --prefix server
npm ci --prefix client
Copy-Item .env.example .env
```

Fill in the database URL and a strong, unique JWT secret in the local `.env`.
Never commit that file. Start the services in separate terminals:

```powershell
npm --prefix server run dev
npm --prefix client run dev
```

The default frontend is `http://localhost:5173` and the API is
`http://localhost:5000`. To use another API origin, set `VITE_API_ORIGIN` in
the frontend process environment before starting Vite or building. Set
`CLIENT_URL` to the frontend origin, including its scheme and port.

The server authenticates to PostgreSQL before listening. It creates missing
tables using Sequelize but does not automatically alter existing tables; schema
changes require a reviewed migration. PostgreSQL certificate and hostname
verification remain enabled.

### Existing database migrations

These scripts are not executed automatically. Before deployment, have the
database owner back up and review the **intended** database, schedule a
maintenance window, and verify that the role can alter the tables. Configure a
libpq service named `cowatch_reviewed` with `sslmode=verify-full` and a trusted
root certificate; keep credentials in a protected password file, not the
repository or command line. Confirm the service targets the intended database
and schema before proceeding.

Using `psql --dbname="service=cowatch_reviewed"`, inspect `\d+ "Messages"`
and `\d+ "RoomParticipants"`, their foreign keys and indexes, and the migration
history maintained by your deployment process. Both scripts assume those
case-sensitive tables exist on the connection's `search_path`, and that
`Messages.id` is a UUID primary or unique key. Migration 001 adds a nullable
UUID self-reference with `ON DELETE SET NULL` and `ON UPDATE CASCADE`;
002 adds two non-null boolean columns defaulting existing rows to `false`.
Neither script creates an index on `replyToId`; deletion of heavily referenced
messages may need a separately reviewed index. Existing room/user foreign keys
and the unique room/user membership index are not created by these scripts.

The scripts are **not idempotent** and there is no migration ledger in this
project. Do not rerun a script if its columns already exist. Fresh databases
created by Sequelize may already contain the columns. For an existing or
partially migrated schema, compare column types, defaults, nullability,
constraints and indexes with the models and resolve differences through a
reviewed migration rather than blindly executing either script. Test on a
restored non-production copy first. `ALTER TABLE` takes locks; prepare for
blocking, and verify the backup and rollback procedure before deployment.

Only when the preflight confirms both scripts are needed, run them in order
from the repository root in PowerShell, stopping on any error:

```powershell
psql -X --set=ON_ERROR_STOP=1 --dbname="service=cowatch_reviewed" --file="server\migrations\001-message-replies.sql"
if ($LASTEXITCODE -eq 0) {
  psql -X --set=ON_ERROR_STOP=1 --dbname="service=cowatch_reviewed" --file="server\migrations\002-participant-moderation.sql"
}
```

Each file is its own transaction; failure in the second does not undo the
first. Reinspect the schema and record exactly which migration succeeded.

## Environment

See [.env.example](.env.example). Important values:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. |
| `JWT_SECRET`, `JWT_EXPIRE` | Token signing secret and lifetime. |
| `PORT`, `CLIENT_URL` | API port and permitted frontend origin. |
| `CALL_RING_TIMEOUT_MS` | Ring and media-join timeout in milliseconds; default 30000, allowed range 5000–120000. |
| `STUN_URLS` | Comma-separated STUN URLs. |
| `TURN_URLS`, `TURN_SHARED_SECRET` | Comma-separated TURN URLs and the server-side coturn REST shared secret. Configure both or neither. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | SMTP settings for password reset. The server requires TLS; port 465 uses implicit TLS and other ports use STARTTLS. |
| `VITE_API_ORIGIN` | Frontend build-time API origin; defaults to `http://localhost:5000`. |

Use a coturn server configured for its time-limited REST authentication scheme;
do not place the shared secret in any `VITE_` variable. Without TURN, calls may
fail on restrictive networks. Without SMTP, password reset returns an error.

## Validation and limitations

```powershell
npm --prefix client test
npm --prefix client run build
node --test server\tests\call-signaling.node.cjs
node --test server\tests\moderation.node.cjs
node --test server\tests\playlist.node.cjs
node --test server\tests\message-schema.node.cjs
```

The signaling check uses isolated in-memory model substitutes; it does not
verify PostgreSQL or actual audio/video. The existing backend Jest setup
truncates its configured database: never run it against production data.

### Manual calling verification

Use an approved non-production deployment and test accounts, with two independent
browser sessions and real cameras, microphones and speakers or headsets.
Use HTTPS outside localhost and configure the deployment's STUN/TURN services.
Do not use production accounts or data for this procedure.

1. Sign in as different users. Create a room in one session and join it from the
   other using its invite token. Start a call and accept the invitation.
2. Confirm each participant sees and hears the other, including after toggling
   camera and microphone. If autoplay is blocked, use the media-enable button.
   Repeat with a third participant and verify every participant's media.
3. End the call, then separately test rejection, caller cancellation and ringing
   timeout. Verify invitations disappear and a new call can be started.
4. Deny camera/microphone permission and test an unavailable device. Confirm an
   actionable error and that a later permitted call can start.
5. During a call, disconnect and restore a network, then leave the room or close
   it as host. Confirm peers disappear and each browser's camera/microphone
   indicators turn off. Rejoin the room, start a fresh call and verify there are
   no duplicate tiles.
6. Repeat across different networks, including one needing TURN; test screen
   sharing, restoring the camera and camera switching on supported devices.

Record browser versions, device/network details and actual outcomes. Passing
signaling or mocked unit tests alone does not establish that media works.

- Real audio/video, screen sharing, ICE recovery and playback synchronization
  have not been verified across physical devices or networks.
- Calls use a mesh, so upload bandwidth and CPU grow with participant count.
  Invitations and busy state live in one server process; multi-instance
  deployments require shared coordination. A restart ends active invitations.
  Run one backend process until the deployment has shared call state and
  compatible Socket.IO routing; load balancing alone does not provide either.
  Notifications require an open, connected application tab; one tab per user
  receives each invitation.
- Hosts can moderate participants and moderators; moderators can moderate only
  ordinary participants. Removed users need explicit reinstatement. Chat mute
  is enforced by the server; microphone mute requests are voluntary and cannot
  remotely change another participant's device.
- Instagram embeds are independently controlled and may be restricted by
  Instagram. YouTube can restrict embedding or autoplay; browser autoplay and
  picture-in-picture support vary.
- Playback position is checkpointed on play/pause/seek. Elapsed playback between
  checkpoints is tracked in server memory and is lost on server restart.
- Playlist additions, removal and reordering are serialized per room. Hosts and
  moderators may remove or reorder items; only hosts can select and control
  playback. Removing an item does not stop media already playing.
- Replies are limited to messages in the same room. Reconnection restores the
  most recent 100 messages; older history is not paginated.
- Uploaded avatars are local files in `server/uploads`; use persistent storage
  and a reviewed upload pipeline for deployment.
