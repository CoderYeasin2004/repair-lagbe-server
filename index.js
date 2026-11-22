import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import Stripe from "stripe";




const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors());



export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const client = new MongoClient(process.env.MONGO_DB_AUTH_URI);

const connectClient = await connectToMongoDB();
const database = client.db("repair-lagbe-db");
const user = database.collection("user");
const session = database.collection("session")
const service = database.collection("service");
const booking = database.collection("bookings");
const payments = database.collection("payments");

app.get("/", (req, res) => {
  res.send("RepairLagbe is Repairing!");
});



const tokenVerify = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).send({ message: "Unauthorized" })
    }

    const token = authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).send({ message: "Unauthorized" })
    }

    // Find session using token
    const sessionData = await session.findOne({ token })

    if (!sessionData) {
      return res.status(401).send({ message: "Unauthorized" })
    }

    // Find user using session userId
    const userData = await user.findOne({
      _id: new ObjectId(sessionData.userId),
    })

    if (!userData) {
      return res.status(401).send({ message: "Unauthorized" })
    }

    req.user = userData
    next()
  } catch (error) {
    console.error("Token verification error:", error)
    return res.status(401).send({ message: "Unauthorized" })
  }
}
// must call after verifyToken

const verifyCustomer = (req, res, next) => {
  if (req.user.role !== "customer") {
    return res.status(403).send({
      message: "Forbidden: Customer access only",
    });
  }

  next();
};


// add user
app.get("/user", async (req, res) => {
  const cursor = user.find({ query });
  const result = await cursor.toArray();
  res.send(result);
});


// Get customer/technician booking count
app.get("/bookings/count", async (req, res) => {
  try {
    const userEmail =
      typeof req.query.userid === "string"
        ? req.query.userid.trim()
        : "";

    const role =
      typeof req.query.role === "string"
        ? req.query.role.trim()
        : "customer";

    if (!userEmail) {
      return res.status(400).send({
        message: "User email is required",
      });
    }

    // Technician booking count
    if (role === "technician") {
      const pendingRequests = await booking.countDocuments({
        technicianEmail: userEmail,
        status: "requested",
      });

      return res.status(200).send({
        pendingRequests,
      });
    }

    // Customer booking count
    const totalRequests = await booking.countDocuments({
      customerEmail: userEmail,
    });

    const activeJobs = await booking.countDocuments({
      customerEmail: userEmail,
      status: { $in: ["requested", "accepted", "in-progress"] },
    });

    const completedJobs = await booking.countDocuments({
      customerEmail: userEmail,
      status: "completed",
    });

    res.status(200).send({
      totalRequests,
      activeJobs,
      completedJobs,
    });
  } catch (error) {
    console.error("Booking count error:", error);

    res.status(500).send({
      message: "Failed to count bookings",
    });
  }
});
// Get booking payment status and final amount
app.get("/bookings/:id/paid", async (req, res) => {
  try {
    const bookingId = req.params.id;

    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).send({ message: "Invalid booking ID" });
    }

    const result = await booking.findOne(
      { _id: new ObjectId(bookingId) },
      {
        projection: {
          paymentStatus: 1,
          finalAmount: 1,
        },
      },
    );

    if (!result) {
      return res.status(404).send({ message: "Booking not found" });
    }

    res.send({
      paymentStatus: result.paymentStatus,
      finalAmount: result.finalAmount,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to get booking details" });
  }
});

app.patch("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const allowedRoles = ["customer", "technician", "admin"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).send({
        success: false,
        message: "Invalid role",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid user ID",
      });
    }

    const result = await user.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).send({
      success: true,
      message: "User role updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Role update error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to update role",
    });
  }
});

// Get a booking by ID
app.get("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid booking ID" });
    }

    const result = await booking.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({ message: "Booking not found" });
    }

    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch booking" });
  }
});

// service details api //

app.get("/services/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid service ID",
      });
    }

    const result = await service.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        message: "Service not found",
      });
    }

    res.status(200).send(result);
  } catch (error) {
    console.error("Get service details error:", error);

    res.status(500).send({
      message: "Failed to fetch service details",
    });
  }
});

// add services & show services in the my services page api


app.get("/services", async (req, res) => {
  try {
    const query = {};

    // Individual technician services
    const technicianEmail =
      typeof req.query.technicianEmail === "string"
        ? req.query.technicianEmail.trim()
        : "";

    if (technicianEmail) {
      query.technicianEmail = technicianEmail;
    }

    // Search
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    // Category filter
    const category =
      typeof req.query.category === "string"
        ? req.query.category.trim()
        : "";

    // Service mode filter
    const serviceMode =
      typeof req.query.serviceMode === "string"
        ? req.query.serviceMode.trim()
        : "";

    // Sorting
    const sort =
      typeof req.query.sort === "string"
        ? req.query.sort
        : "";

    // Home page featured services
    const featured = req.query.featured === "true";

    // Search by title or category
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Service mode filter
    if (serviceMode) {
      query.serviceMode = serviceMode;
    }

    // Featured services: approved and available only
    if (featured) {
      query.approvalStatus = "approved";
      query.isAvailable = { $in: [true, "true"] };
    }

    // Sort options
    let sortOption = {};

    if (sort === "price-asc") {
      sortOption = { basePrice: 1 };
    } else if (sort === "price-desc") {
      sortOption = { basePrice: -1 };
    } else if (sort === "newest") {
      sortOption = { createdAt: -1 };
    }

    // Build MongoDB query
    let cursor = service.find(query);

    // Featured services always show latest 6
    if (featured) {
      cursor = cursor.sort({ createdAt: -1 }).limit(6);
    } else {
      cursor = cursor.sort(sortOption);
    }

    const result = await cursor.toArray();

    res.status(200).send(result);
  } catch (error) {
    console.error("Failed to fetch services:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch services",
    });
  }
});


app.patch("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, finalAmount } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const bookingData = await booking.findOne({
      _id: new ObjectId(id),
    });

    if (!bookingData) {
      return res.status(404).send({
        success: false,
        message: "Booking not found",
      });
    }

    const allowedTransitions = {
      requested: ["accepted", "rejected"],
      accepted: ["in-progress"],
      "in-progress": ["completed"],
    };

    if (!allowedTransitions[bookingData.status]?.includes(status)) {
      return res.status(400).send({
        success: false,
        message: `Cannot change status from ${bookingData.status} to ${status}`,
      });
    }

    const updateData = { status };

    if (status === "completed") {
      const amount = Number(finalAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).send({
          success: false,
          message: "Final amount must be greater than 0",
        });
      }

      updateData.finalAmount = amount;
    }

    const result = await booking.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.status(200).send({
      success: true,
      message: "Booking status updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Booking status update error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to update booking status",
    });
  }
});


app.post("/services", tokenVerify, async (req, res) => {
  console.log("Authorization:", req.headers.authorization)
  try {
    const serviceData = {
      ...req.body,
      price: Number(req.body.price),
      createdAt: new Date(),
    };

    const result = await service.insertOne(serviceData);

    res.status(201).send(result);
  } catch (error) {
    console.error("Create service error:", error);

    res.status(500).send({
      message: "Failed to create service",
    });
  }
});

// Create repair booking
app.post("/bookings", tokenVerify, verifyCustomer, async (req, res) => {
  try {
    const {
      serviceId,
      customerName,
      customerEmail,
      customerPhone,
      address,
      preferredDate,
      problemDescription,
    } = req.body;

    // Validate required fields
    if (
      !serviceId ||
      !customerName ||
      !customerEmail ||
      !customerPhone ||
      !address ||
      !preferredDate ||
      !problemDescription
    ) {
      return res.status(400).send({
        message: "Please provide all required information.",
      });
    }

    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).send({
        message: "Invalid service ID.",
      });
    }

    if (problemDescription.trim().length < 20) {
      return res.status(400).send({
        message: "Problem description must be at least 20 characters.",
      });
    }

    const requestedDate = new Date(preferredDate);

    if (
      Number.isNaN(requestedDate.getTime()) ||
      requestedDate.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0)
    ) {
      return res.status(400).send({
        message: "Please select today or a future date.",
      });
    }

    // Find service
    const selectedService = await service.findOne({
      _id: new ObjectId(serviceId),
    });

    if (
      !selectedService ||
      selectedService.approvalStatus !== "approved" ||
      selectedService.isAvailable === false ||
      selectedService.isAvailable === "false" ||
      selectedService.availability === "unavailable"
    ) {
      return res.status(404).send({
        message: "This service is not available.",
      });
    }

    // Prevent duplicate active requests
    const existingBooking = await booking.findOne({
      serviceId,
      customerEmail,
      status: { $in: ["requested", "accepted", "in-progress"] },
    });

    if (existingBooking) {
      return res.status(409).send({
        message: "You already have an active request for this service.",
      });
    }

    // Prepare booking data
    const bookingData = {
      serviceId,
      serviceTitle: selectedService.title,
      serviceImage: selectedService.imageUrl || selectedService.image || "",
      category: selectedService.category,
      basePrice: Number(selectedService.basePrice ?? selectedService.price),
      technicianName: selectedService.technicianName,
      technicianEmail: selectedService.technicianEmail,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      address: address.trim(),
      preferredDate: requestedDate,
      problemDescription: problemDescription.trim(),
      status: "requested",
      finalAmount: Number(selectedService.basePrice ?? selectedService.price),
      paymentStatus: "unpaid",
      createdAt: new Date(),
    };

    const result = await booking.insertOne(bookingData);

    res.status(201).send({
      success: true,
      message: "Repair request submitted successfully.",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).send({
      message: "Failed to submit repair request.",
    });
  }
});


// Get customer/technician bookings
app.get("/bookings", async (req, res) => {
  try {
    const customerEmail =
      typeof req.query.customerEmail === "string"
        ? req.query.customerEmail.trim()
        : "";

    const technicianEmail =
      typeof req.query.technicianEmail === "string"
        ? req.query.technicianEmail.trim()
        : "";

    let query = {};

    if (technicianEmail) {
      query.technicianEmail = technicianEmail;
    } else if (customerEmail) {
      query.customerEmail = customerEmail;
    } else {
      return res.status(400).send({
        success: false,
        message: "Customer or technician email is required.",
      });
    }

    const result = await booking
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send({
      success: true,
      totalBookings: result.length,
      bookings: result,
    });
  } catch (error) {
    console.error("Get bookings error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch bookings.",
    });
  }
});

// delete service api
app.delete("/services/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid service ID",
      });
    }

    const result = await service.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).send({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to delete service",
    });
  }
});

// Payment verification API
app.post("/payments/verify", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({
        success: false,
        message: "Stripe session ID is required.",
      });
    }

    // Retrieve Stripe Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return res.status(400).send({
        success: false,
        message: "Payment is not completed.",
      });
    }

    const bookingId = session.metadata?.bookingId;
    const customerEmail = session.metadata?.customerEmail;

    if (!bookingId || !ObjectId.isValid(bookingId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid booking information.",
      });
    }

    // Find booking
    const selectedBooking = await booking.findOne({
      _id: new ObjectId(bookingId),
    });

    if (!selectedBooking) {
      return res.status(404).send({
        success: false,
        message: "Booking not found.",
      });
    }

    if (selectedBooking.customerEmail !== customerEmail) {
      return res.status(403).send({
        success: false,
        message: "Customer email does not match.",
      });
    }

    if (selectedBooking.status !== "completed") {
      return res.status(400).send({
        success: false,
        message: "Booking is not completed.",
      });
    }

    // Prevent duplicate payment
    const existingPayment = await payments.findOne({
      bookingId,
    });

    if (existingPayment) {
      return res.status(200).send({
        success: true,
        message: "Payment already verified.",
      });
    }

    const paymentIntent = session.payment_intent;
    const transactionId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;

    // Prepare payment document
    const paymentData = {
      bookingId,
      serviceTitle: selectedBooking.serviceTitle,
      customerName: selectedBooking.customerName,
      customerEmail: selectedBooking.customerEmail,
      technicianName: selectedBooking.technicianName,
      technicianEmail: selectedBooking.technicianEmail,
      amount: selectedBooking.finalAmount,
      currency: session.currency,
      transactionId,
      stripeSessionId: session.id,
      paymentStatus: "paid",
      paidAt: new Date(),
    };

    // Save payment
    await payments.insertOne(paymentData);

    // Update booking payment status
    await booking.updateOne(
      {
        _id: new ObjectId(bookingId),
        status: "completed",
        paymentStatus: "unpaid",
      },
      {
        $set: {
          paymentStatus: "paid",
        },
      },
    );

    return res.status(200).send({
      success: true,
      message: "Payment verified and saved successfully.",
      payment: paymentData,
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return res.status(500).send({
      success: false,
      message: "Failed to verify payment.",
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
