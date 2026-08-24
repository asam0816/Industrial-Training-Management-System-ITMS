# Industrial Training Management System (ITMS)

A complete full-stack project using **Next.js/React**, **Express.js**, **MongoDB/Mongoose**, secure JWT cookie authentication, role-based access, document upload/download, announcements, Q&A, notifications, dashboards, audit logging and a research usability evaluation module.

The folder layout intentionally follows the same overall full-stack pattern as the supplied EMS reference project: a root project containing separate **client** and **server** applications. The client is Next.js rather than Vite because this project explicitly requires Next.js.

## 1. Required software

Install these first:

- Node.js 20 LTS or 22 LTS
- Visual Studio Code
- MongoDB Community Server + MongoDB Compass, or MongoDB Atlas
- Git (recommended)

Check Node/npm in the VS Code terminal:

```bash
node -v
npm -v
```

## 2. Open the project in VS Code

Extract the ZIP and open the `itms-fullstack` folder in VS Code.

The root structure is:

```text
itms-fullstack/
├── client/        # Next.js + React frontend
├── server/        # Express + MongoDB backend
├── package.json
├── .gitignore
└── README.md
```

## 3. CLIENT FIRST — install and run the frontend

Open a VS Code terminal from the project root:

```bash
cd client
npm install
```

The client already contains:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Run it:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

At this stage the frontend opens, but protected pages require the Express API.

### Main client folders

```text
client/
├── app/
│   ├── admin/
│   ├── coordinator/
│   ├── student/
│   ├── login/
│   ├── forgot-password/
│   ├── reset-password/
│   ├── notifications/
│   ├── evaluation/
│   ├── search/
│   └── settings/
├── components/
├── context/
├── services/
├── utils/
├── public/
└── package.json
```

## 4. SERVER SECOND — prepare MongoDB

If using local MongoDB, make sure the MongoDB service is running.

Default connection used by this project:

```text
mongodb://127.0.0.1:27017/itms
```

You can verify it in MongoDB Compass.

If using Atlas, replace `MONGODB_URI` in `server/.env` with your Atlas connection string.

## 5. Install the backend

Open a second VS Code terminal:

```bash
cd server
npm install
```

The project includes a development `.env`. Before real deployment, replace the JWT secrets with strong random values.

Important server settings:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/itms
CLIENT_URL=http://localhost:3000
```

Run the server:

```bash
npm run dev
```

Expected terminal output:

```text
MongoDB connected successfully
ITMS Server running on http://localhost:5000
```

Test the API in your browser or Thunder Client:

```text
GET http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "ITMS API is running"
}
```

## 6. Seed the database

With MongoDB running:

```bash
cd server
npm run seed
```

This creates:

- 1 administrator
- 2 coordinators
- 3 batches
- 18 students
- document categories
- a downloadable sample PDF
- sample announcement
- sample question/answer
- notifications
- activity log

### Development login accounts

Administrator:

```text
Email: admin@itms.test
Password: Admin123!
```

Coordinator:

```text
Email: coordinator@itms.test
Password: Coordinator123!
```

Student:

```text
Email: student1@itms.test
Password: Student123!
```

Change these before any public deployment.

## 7. Run the complete system

You can use two VS Code terminals:

Terminal 1:

```bash
cd client
npm run dev
```

Terminal 2:

```bash
cd server
npm run dev
```

Or install the root helper dependency once:

```bash
npm install
```

Then run both from the root:

```bash
npm run dev
```

## 8. Correct development order

### Phase A — Client development

1. Landing page
2. Login/forgot/reset password
3. Shared dashboard shell and navigation
4. Admin dashboard
5. Coordinator dashboard
6. Student dashboard
7. Users
8. Students
9. Batches
10. Document categories
11. Documents
12. Announcements
13. Questions & answers
14. FAQ
15. Notifications
16. Profile/security
17. Research evaluation
18. Admin evaluation analytics
19. Search
20. Responsive UI

### Phase B — Server development

1. Express application
2. MongoDB connection
3. Mongoose models
4. Authentication and JWT cookies
5. RBAC middleware
6. User APIs
7. Student APIs
8. Batch APIs
9. Document category APIs
10. Protected document upload/download
11. Announcement APIs
12. Question/answer APIs
13. Notifications
14. Dashboards
15. Evaluation APIs
16. Audit/activity logs
17. Search
18. Error handling and security
19. Seed data
20. Tests

### Phase C — Integration

The data path is:

```text
Next.js page
   ↓
React component
   ↓
Axios instance
   ↓
Express REST API
   ↓
Controller/service
   ↓
Mongoose
   ↓
MongoDB
```

## 9. Role permissions

### Administrator

- dashboard
- user management
- student management
- batch management
- document management
- document categories
- announcements
- Q&A
- evaluation analytics
- audit logs
- system settings

### Coordinator

- dashboard
- view/search students
- view batches
- upload/manage documents
- create/manage announcements
- answer/resolve questions
- manage FAQ
- evaluation
- profile

### Student

- dashboard
- announcements
- authorized documents/downloads
- questions
- FAQ
- notifications
- research evaluation
- profile
- password/security

All backend permissions are enforced by Express middleware; hiding menu items is not treated as security.

## 10. Core API routes

```text
/api/auth
/api/users
/api/students
/api/batches
/api/document-categories
/api/documents
/api/announcements
/api/questions
/api/notifications
/api/dashboard
/api/evaluations
/api/activity-logs
/api/profile
/api/search
```

## 11. Security implemented

- bcrypt password hashing
- access + refresh JWTs
- HTTP-only cookies
- refresh-session rotation/revocation
- role-based authorization middleware
- account status checks
- authentication rate limiting
- CORS restricted to `CLIENT_URL`
- Helmet security headers
- body-size limits
- strong password checks
- hashed password-reset tokens
- protected document downloads
- MIME/file-size validation
- UUID filenames
- centralized error handling
- audit/activity records
- no password hash in normal API responses
- no server secrets in the Next.js client

## 12. Password reset during local development

The forgot-password endpoint returns a reset URL only in development so the project works without an SMTP account. In production, connect an email provider before public deployment.

## 13. File uploads

Local development files are stored in:

```text
server/src/uploads/
```

They are **not** publicly exposed as a static directory. Downloads go through:

```text
GET /api/documents/:id/download
```

The backend authenticates the user and checks batch permissions before sending the file.

## 14. Tests

After installing server packages:

```bash
cd server
npm test
```

A base API health test is included. Extend the test suite as you complete the research testing chapter.

## 15. Common problems

### `'next' is not recognized`

You have not installed client dependencies:

```bash
cd client
npm install
npm run dev
```

### MongoDB connection error

Verify MongoDB is running or correct `MONGODB_URI` in `server/.env`.

### CORS/cookie login issue

Make sure:

```env
CLIENT_URL=http://localhost:3000
```

and:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Restart both servers after changing environment files.

### Seed fails because records already exist

The included seed script clears development ITMS collections before creating the sample data. Do not run it against a production database.

## 16. Production deployment

Recommended:

- Client: Vercel
- Express API: Render/Railway
- MongoDB: MongoDB Atlas
- Document storage: S3-compatible object storage for persistent production files

For production set:

```env
NODE_ENV=production
COOKIE_SECURE=true
CLIENT_URL=https://your-frontend-domain.example
```

Use strong random JWT secrets and HTTPS.

## 17. Important project note

Next.js **is a React framework**, so this application does not create a separate Vite React app and a Next.js app. `client/` is the React frontend implemented through Next.js App Router, while `server/` is the independent Express REST API.
