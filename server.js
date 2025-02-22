// Backend - server.js
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://localhost:27017/transactionsDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const transactionSchema = new mongoose.Schema({
  title: String,
  price: Number,
  description: String,
  category: String,
  sold: Boolean,
  dateOfSale: String
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Fetch and store data
app.get('/api/init', async (req, res) => {
  const { data } = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
  await Transaction.deleteMany({});
  await Transaction.insertMany(data);
  res.json({ message: 'Database initialized with seed data' });
});

// List transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
  const { month, search = '', page = 1, perPage = 10 } = req.query;
  const regex = new RegExp(search, 'i');
  const transactions = await Transaction.find({
    dateOfSale: { $regex: `-${month}-` },
    $or: [
      { title: regex },
      { description: regex },
      { price: isNaN(search) ? undefined : parseFloat(search) }
    ]
  })
    .skip((page - 1) * perPage)
    .limit(parseInt(perPage));
  res.json(transactions);
});

// Statistics API
app.get('/api/statistics', async (req, res) => {
  const { month } = req.query;
  const totalSale = await Transaction.aggregate([
    { $match: { dateOfSale: { $regex: `-${month}-` }, sold: true } },
    { $group: { _id: null, totalSales: { $sum: '$price' }, soldItems: { $sum: 1 } } }
  ]);
  const notSoldItems = await Transaction.countDocuments({ dateOfSale: { $regex: `-${month}-` }, sold: false });
  res.json({
    totalSales: totalSale[0]?.totalSales || 0,
    soldItems: totalSale[0]?.soldItems || 0,
    notSoldItems
  });
});

// Bar chart API
app.get('/api/bar-chart', async (req, res) => {
  const { month } = req.query;
  const ranges = [
    { range: '0-100', min: 0, max: 100 },
    { range: '101-200', min: 101, max: 200 },
    { range: '201-300', min: 201, max: 300 },
    { range: '301-400', min: 301, max: 400 },
    { range: '401-500', min: 401, max: 500 },
    { range: '501-600', min: 501, max: 600 },
    { range: '601-700', min: 601, max: 700 },
    { range: '701-800', min: 701, max: 800 },
    { range: '801-900', min: 801, max: 900 },
    { range: '901+', min: 901, max: Infinity }
  ];
  const barData = await Promise.all(
    ranges.map(async ({ range, min, max }) => {
      const count = await Transaction.countDocuments({
        dateOfSale: { $regex: `-${month}-` },
        price: { $gte: min, $lte: max }
      });
      return { range, count };
    })
  );
  res.json(barData);
});

// Pie chart API
app.get('/api/pie-chart', async (req, res) => {
  const { month } = req.query;
  const categories = await Transaction.aggregate([
    { $match: { dateOfSale: { $regex: `-${month}-` } } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);
  res.json(categories);
});

// Combined API
app.get('/api/combined', async (req, res) => {
  const { month } = req.query;
  const [statistics, barChart, pieChart] = await Promise.all([
    axios.get(`http://localhost:5000/api/statistics?month=${month}`),
    axios.get(`http://localhost:5000/api/bar-chart?month=${month}`),
    axios.get(`http://localhost:5000/api/pie-chart?month=${month}`)
  ]);
  res.json({
    statistics: statistics.data,
    barChart: barChart.data,
    pieChart: pieChart.data
  });
});

app.listen(5000, () => console.log('Server running on port 5000'));
