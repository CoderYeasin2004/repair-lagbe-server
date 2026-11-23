import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
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
    // await client.connect();
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



const verifyToken = async (req, res, next) => {

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

const verifyCustomer = (req, res, next) => {
  if (req.user.role !== "customer") {
    return res.status(403).send({
      message: "Forbidden: Customer access only",
    });
  }

  next();
};

const verifyTechnician = (req, res, next) => {
  if (req.user.role !== "technician") {
    return res.status(403).send({
      message: "Forbidden: Technician access only",
    });
  }

  next();
};

const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).send({
      success: false,
      message: "Forbidden: Admin access only",
    });
  }

  next();
};


// Get all users
app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await user.find({}).toArray();
    res.send({ users });
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch users" });
  }
});


// Admin dashboard overview stats
app.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [totalUsers, totalTechnicians, pendingServices] =
      await Promise.all([
        user.countDocuments({}),
        user.countDocuments({ role: "technician" }),
        service.countDocuments({ approvalStatus: "pending" }),
      ]);

    res.status(200).send({
      success: true,
      totalUsers,
      totalTechnicians,
      pendingServices,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to fetch dashboard stats",
    });
  }
});

// Admin all service view
app.get("/admin/services", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await service
      .find({})
      .sort({ approvalStatus: 1, createdAt: -1 })
      .toArray();

    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch admin services",
    });
  }
});

// Get customer/technician booking count
app.get("/bookings/count", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const role = req.user.role;

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
    if (role === "customer") {
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

      return res.status(200).send({
        totalRequests,
        activeJobs,
        completedJobs,
      });
    }

    return res.status(403).send({
      message: "Access denied.",
    });
  } catch (error) {
    console.error("Booking count error:", error);

    res.status(500).send({
      message: "Failed to count bookings",
    });
  }
});

// Get booking payment status and final amount
app.get("/bookings/:id/paid",verifyToken,verifyCustomer,
  async (req, res) => {
    try {
      const bookingId = req.params.id;

      if (!ObjectId.isValid(bookingId)) {
        return res.status(400).send({
          message: "Invalid booking ID",
        });
      }

      const result = await booking.findOne(
        {
          _id: new ObjectId(bookingId),
          customerEmail: req.user.email,
        },
        {
          projection: {
            paymentStatus: 1,
            finalAmount: 1,
          },
        }
      );

      if (!result) {
        return res.status(404).send({
          message: "Booking not found",
        });
      }

      res.status(200).send({
        paymentStatus: result.paymentStatus,
        finalAmount: result.finalAmount,
      });
    } catch (error) {
      console.error("Get booking payment details error:", error);

      res.status(500).send({
        message: "Failed to get booking details",
      });
    }
  }
);

app.patch("/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
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
    if (String(id) === String(req.user._id)) {
  return res.status(403).send({
    success: false,
    message: "You cannot change your own role",
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
app.get("/bookings/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid booking ID",
      });
    }

    const query = {
      _id: new ObjectId(id),
    };

    // Customer can access only their own booking
    if (req.user.role === "customer") {
      query.customerEmail = req.user.email;
    }
    // Technician can access only bookings assigned to them
    else if (req.user.role === "technician") {
      query.technicianEmail = req.user.email;
    } else {
      return res.status(403).send({
        message: "Access denied.",
      });
    }

    const result = await booking.findOne(query);

    if (!result) {
      return res.status(404).send({
        message: "Booking not found",
      });
    }

    res.status(200).send(result);
  } catch (error) {
    console.error("Get booking error:", error);

    res.status(500).send({
      message: "Failed to fetch booking",
    });
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

// Get services
app.get("/services", async (req, res) => {
  try {
    const query = {};

    // Individual technician services
    const technicianEmail =
      typeof req.query.technicianEmail === "string"
        ? req.query.technicianEmail.trim()
        : "";

    // Public page: show only approved and available services
    if (!technicianEmail) {
      query.approvalStatus = "approved";
      query.isAvailable = { $in: [true, "true"] };
    }

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

app.patch("/services/:id", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service ID" });
    }

    const {
      title,
      category,
      description,
      image,
      basePrice,
      estimatedDuration,
      serviceMode,
      serviceArea,
    } = req.body;

    if (!title || !category || !description || !image ||
        !estimatedDuration || !serviceMode || !serviceArea) {
      return res.status(400).send({ message: "All service fields are required" });
    }

    const price = Number(basePrice);

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).send({ message: "Base price must be greater than 0" });
    }

    const result = await service.updateOne(
      {
        _id: new ObjectId(id),
        technicianEmail: req.user.email,
      },
      {
        $set: {
          title,
          category,
          description,
          image,
          basePrice: price,
          estimatedDuration,
          serviceMode,
          serviceArea,
          approvalStatus: "pending",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Service not found or you do not own this service",
      });
    }

    const updatedService = await service.findOne({
      _id: new ObjectId(id),
      technicianEmail: req.user.email,
    });

    res.send({
      message: "Service updated successfully. Waiting for admin approval.",
      service: updatedService,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to update service" });
  }
});

// get all booking in admin
app.get("/admin/bookings", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    const validStatuses = [
      "requested",
      "accepted",
      "rejected",
      "in-progress",
      "completed",
      "cancelled",
    ];

    const query = {};

    if (status && validStatuses.includes(status)) {
      query.status = status;
    }

    const bookings = await booking
      .find(query)
      .sort({ preferredDate: -1 })
      .toArray();

    res.send(bookings);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch admin bookings",
    });
  }
});


// Get all payment transactions for admin
app.get("/admin/payments", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const allPayments = await payments
      .find({})
      .sort({ paidAt: -1 })
      .toArray();

    const revenueResult = await payments
      .aggregate([
        { $match: { paymentStatus: "paid" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    const totalRevenue = revenueResult[0]?.totalRevenue || 0;

    res.send({
      payments: allPayments,
      totalRevenue,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch payment transactions",
    });
  }
});


// repair booking status update api
app.patch("/bookings/:id",verifyToken,verifyTechnician,async (req, res) => {
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

      // Check booking ownership
      if (bookingData.technicianEmail !== req.user.email) {
        return res.status(403).send({
          success: false,
          message: "You cannot update another technician's booking",
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
  }
);
// booking cancel
app.patch("/bookings/:id/cancel",verifyToken,verifyCustomer,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid booking ID",
        });
      }

      const result = await booking.updateOne(
        {
          _id: new ObjectId(id),
          customerEmail: req.user.email,
          status: "requested",
        },
        {
          $set: {
            status: "cancelled",
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(400).send({
          message:
            "Booking not found, or only requested bookings can be cancelled",
        });
      }

      res.send({
        message: "Booking cancelled successfully",
      });
    } catch (error) {
      res.status(500).send({
        message: "Failed to cancel booking",
      });
    }
  }
);


// Admin: Approve or Reject Service
app.patch(
  "/admin/services/:id/approval",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { approvalStatus } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid service ID",
        });
      }

      if (!["approved", "rejected"].includes(approvalStatus)) {
        return res.status(400).send({
          message: "Invalid approval status",
        });
      }

      const result = await service.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { approvalStatus },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({
          message: "Service not found",
        });
      }

      res.send({
        success: true,
        message: `Service ${approvalStatus} successfully`,
      });
    } catch (error) {
      res.status(500).send({
        message: "Failed to update service approval",
      });
    }
  }
);

app.post("/services", verifyToken,  verifyTechnician, async (req, res) => {
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
app.post("/bookings", verifyToken, verifyCustomer, async (req, res) => {
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
app.get("/bookings", verifyToken, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "customer") {
      query.customerEmail = req.user.email;
    } else if (req.user.role === "technician") {
      query.technicianEmail = req.user.email;
    } else {
      return res.status(403).send({
        success: false,
        message: "Access denied.",
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
app.delete("/services/:id", verifyToken, verifyTechnician, async (req, res) => {
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
  technicianEmail: req.user.email,
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
app.post("/payments/verify",verifyToken,verifyCustomer,
  async (req, res) => {
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

      // Verify logged-in customer
      if (
        !customerEmail ||
        customerEmail !== req.user.email
      ) {
        return res.status(403).send({
          success: false,
          message: "Customer email does not match.",
        });
      }

      // Find booking owned by logged-in customer
      const selectedBooking = await booking.findOne({
        _id: new ObjectId(bookingId),
        customerEmail: req.user.email,
      });

      if (!selectedBooking) {
        return res.status(404).send({
          success: false,
          message: "Booking not found.",
        });
      }

      if (selectedBooking.status !== "completed") {
        return res.status(400).send({
          success: false,
          message: "Booking is not completed.",
        });
      }

      if (selectedBooking.paymentStatus === "paid") {
        return res.status(200).send({
          success: true,
          message: "Payment already verified.",
        });
      }

      if (selectedBooking.paymentStatus !== "unpaid") {
        return res.status(400).send({
          success: false,
          message: "Invalid booking payment status.",
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
        typeof paymentIntent === "string"
          ? paymentIntent
          : paymentIntent?.id;

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
          customerEmail: req.user.email,
          status: "completed",
          paymentStatus: "unpaid",
        },
        {
          $set: {
            paymentStatus: "paid",
          },
        }
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
  }
);

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});


export default app;