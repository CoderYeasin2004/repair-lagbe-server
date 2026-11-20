import express from 'express';
import cors from 'cors'
import { MongoClient } from 'mongodb';
import 'dotenv/config'



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
const database = client.db("repair-lagbe-db")
const user = database.collection("user");
const service = database.collection("service");

app.get('/', (req, res) => {
  res.send('RepairLagbe is Repairing!');
});


// add user
app.get('/user', async (req, res) => {
  const cursor = user.find({});
  const result = await cursor.toArray();
  res.send(result);
});

// add services

app.get("/services", async (req, res) => {
  try {
    const result = await service.find().toArray()

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
  try {
    const serviceData = req.body

    const result = await service.insertOne(serviceData)

    res.status(201).send(result)
  } catch (error) {
    console.error("Create service error:", error)

    res.status(500).send({
      message: "Failed to create service",
    })
  }
})



app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});