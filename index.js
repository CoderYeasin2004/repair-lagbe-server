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



app.get('/user', async (req, res) => {
  const cursor = user.find({});
  const result = await cursor.toArray();
  res.send(result);
});




app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});