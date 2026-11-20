import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb"
import "dotenv/config";

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGO_DB_AUTH_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectClient = await connectToMongoDB();
const database = client.db("repair-lagbe-db");
const user = database.collection("user");
const service = database.collection("service");
const booking = database.collection("bookings");

app.get("/", (req, res) => {
  res.send("RepairLagbe is Repairing!");
});




// add user
app.get("/user", async (req, res) => {

  const cursor = user.find({query});
  const result = await cursor.toArray();
  res.send(result);
});



// service details api //

app.get("/services/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid service ID",
      })
    }

    const result = await service.findOne({
      _id: new ObjectId(id),
    })

    if (!result) {
      return res.status(404).send({
        message: "Service not found",
      })
    }

    res.status(200).send(result)
  } catch (error) {
    console.error("Get service details error:", error)

    res.status(500).send({
      message: "Failed to fetch service details",
    })
  }
})

// add services & show services in the my services page api

app.get("/services", async (req, res) => {
  try {
    const query = {}

    // Search
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : ""

    // Category Filter
    const category =
      typeof req.query.category === "string"
        ? req.query.category
        : ""

    // Service Mode Filter
    const serviceMode =
      typeof req.query.serviceMode === "string"
        ? req.query.serviceMode
        : ""

    // Sorting
    const sort =
      typeof req.query.sort === "string"
        ? req.query.sort
        : ""

    // Search by title or category
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ]
    }

    // Filter by category
    if (category) {
      query.category = category
    }

    // Filter by service mode
    if (serviceMode) {
      query.serviceMode = serviceMode
    }

    // Sort options
    let sortOption = {}

    if (sort === "price-asc") {
      sortOption = { price: 1 }
    } else if (sort === "price-desc") {
      sortOption = { price: -1 }
    } else if (sort === "newest") {
      sortOption = { createdAt: -1 }
    }

    console.log("Mongo query:", JSON.stringify(query))
    console.log("Sort option:", sortOption)

    const result = await service
      .find(query)
      .sort(sortOption)
      .toArray()

    res.status(200).send(result)
  } catch (error) {
    console.error("Failed to fetch services:", error)

    res.status(500).send({
      success: false,
      message: "Failed to fetch services",
    })
  }
})

app.post("/services", async (req, res) => {
  const serviceData = {
  ...req.body,
  price: Number(req.body.price),
  createdAt: new Date(),
}

const result = await service.insertOne(serviceData)
  try {
    const serviceData = req.body;

    res.status(201).send(result);
  } catch (error) {
    console.error("Create service error:", error);

    res.status(500).send({
      message: "Failed to create service",
    });
  }
});

// Create repair booking
app.post("/bookings", async (req, res) => {
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
      requestedDate.setHours(0, 0, 0, 0) <
        new Date().setHours(0, 0, 0, 0)
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


app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
