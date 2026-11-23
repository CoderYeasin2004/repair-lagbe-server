# RepairLagbe – Backend

RepairLagbe is an on-demand device and home appliance repair booking platform. The backend provides APIs for authentication, service management, repair bookings, user management, and payment processing.

## Live Demo

- Backend API: `repair-lgbe-server.vercel.app`
- Frontend Website: `repair-lgbe-client.vercel.app`

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Better Auth
- Stripe
- dotenv
- CORS

## Features

### Authentication & Authorization
- User authentication with Better Auth
- Role-based access control
- Customer, Technician, and Admin roles
- Protected API routes using middleware

### Services Management
- Create repair services
- Get all available services
- Get service details
- Update and delete technician services
- Admin service approval and rejection

### Booking Management
- Create repair bookings
- Get customer and technician bookings
- Update booking status
- Cancel eligible bookings
- Prevent duplicate active booking requests

### Admin Management
- Get dashboard statistics
- View all users
- Manage user roles
- Approve or reject services
- View all bookings
- View payment transactions and total revenue

### Payment Management
- Create Stripe Checkout sessions
- Verify successful payments
- Store payment information
- Update booking payment status
- Prevent duplicate payments

## Database Collections

The application uses MongoDB for data storage.

Main application collections:

- `users`
- `services`
- `bookings`
- `payments`

Better Auth also uses its required authentication-related collections.

## Installation

Clone the repository:

```bash
git clone YOUR_BACKEND_GITHUB_URL
```

Go to the backend project directory:

```bash
cd repair-lgbe-server
```

Install dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root and configure the required environment variables.

```env
PORT=5000
MONGO_DB_AUTH_URI=YOUR_MONGODB_CONNECTION_STRING
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
```

Add any other environment variables used by your backend configuration.

## Run Locally

Start the backend server using the script configured in `package.json`.

For example:

```bash
npm run dev
```

The backend will run on:

```text
http://localhost:5000
```

## API Authentication

Protected API requests require a valid authentication token in the request headers.

```http
Authorization: Bearer YOUR_AUTH_TOKEN
```

Role-based middleware controls access to protected routes:

- `verifyToken`
- `verifyCustomer`
- `verifyTechnician`
- `verifyAdmin`

## Deployment

The backend can be deployed on a Node.js hosting platform.

Before deployment:
- Configure MongoDB connection string.
- Add Stripe secret key.
- Configure required environment variables.
- Set the correct frontend origin in CORS.
- Make sure the MongoDB database is accessible from the hosting platform.

## Project Structure

```text
repair-lgbe-server/
├── index.js
├── package.json
├── .env
└── README.md
```

