// quantum-ml-backend.js
const EventEmitter = require('events');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

// ======================
// Quantum ML Dashboard Backend
// ======================
class QuantumMLDashboard extends EventEmitter {
  constructor() {
    super();
    this.priceChartData = [];
    this.currentData = null;
    this.isLoading = false;
    this.lastPrediction = null;
  }

  async loadDashboardData() {
    this.isLoading = true;
    try {
      // Simulated data - replace with real API calls in production
      const mockData = {
        currentPrice: 9138.90,
        priceChange: 45.20,
        priceChangePercent: 0.50,
        dataPoints: 1261,
        featureCount: 60,
        historicalPrices: this.generateHistoricalData(),
        models: {
          randomForest: { accuracy: 0.5597, precision: 0.5573, recall: 0.5597 },
          hybrid: { accuracy: 0.5309, precision: 0.5160, recall: 0.5309 },
          svm: { accuracy: 0.5350, precision: 0.2862, recall: 0.5350 }
        }
      };

      this.currentData = mockData;
      this.emit('dataLoaded', mockData);
      return mockData;
    } catch (error) {
      console.error('[ERROR] Loading dashboard data failed:', error);
      this.emit('error', 'Failed to load data');
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  generateHistoricalData() {
    const data = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        timestamp: date.toISOString(),
        price: 9100 + (Math.random() - 0.5) * 200
      });
    }
    return data;
  }

  async simulatePrediction() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const prediction = {
          direction: Math.random() > 0.5 ? 'UP' : 'DOWN',
          confidence: Math.floor(Math.random() * 30) + 70,
          probabilities: {
            up: Math.random() * 100,
            down: Math.random() * 100
          },
          model: ['random_forest', 'hybrid', 'svm'][Math.floor(Math.random() * 3)],
          timestamp: new Date().toISOString()
        };

        // Normalize probabilities
        const total = prediction.probabilities.up + prediction.probabilities.down;
        prediction.probabilities.up = (prediction.probabilities.up / total * 100).toFixed(1);
        prediction.probabilities.down = (prediction.probabilities.down / total * 100).toFixed(1);

        this.lastPrediction = prediction;
        this.emit('predictionComplete', prediction);
        resolve(prediction);
      }, 2000); // Simulate 2s processing time
    });
  }

  async runPrediction() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.emit('predictionStarted');
    try {
      return await this.simulatePrediction();
    } catch (error) {
      console.error('[ERROR] Prediction failed:', error);
      this.emit('error', 'Prediction failed');
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  simulatePriceUpdate() {
    if (!this.currentData) return;
    
    const newPrice = this.currentData.currentPrice + (Math.random() - 0.5) * 10;
    const change = newPrice - this.currentData.currentPrice;
    
    this.currentData = {
      ...this.currentData,
      currentPrice: newPrice,
      priceChange: change,
      priceChangePercent: (change / this.currentData.currentPrice * 100).toFixed(2)
    };

    // Add to chart data
    this.priceChartData.push({
      timestamp: new Date().toISOString(),
      price: newPrice
    });

    if (this.priceChartData.length > 30) {
      this.priceChartData.shift();
    }

    this.emit('priceUpdate', {
      currentPrice: newPrice,
      priceChange: change,
      priceChangePercent: this.currentData.priceChangePercent
    });

    this.emit('chartUpdate', this.priceChartData.slice());
  }
}

// ======================
// Server Initialization
// ======================
const app = express();
const PORT = 3000;
const WS_PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Create dashboard instance
const dashboard = new QuantumMLDashboard();

// Start WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Send initial data
  if (dashboard.currentData) {
    ws.send(JSON.stringify({
      type: 'initialData',
      data: dashboard.currentData
    }));
  }

  // Handle messages from client
  ws.on('message', (message) => {
    switch (message.toString()) {
      case 'getPrediction':
        dashboard.runPrediction();
        break;
      case 'getDashboardData':
        dashboard.loadDashboardData();
        break;
    }
  });
});

// Forward events to WebSocket clients
dashboard.on('dataLoaded', (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'dataLoaded',
        data
      }));
    }
  });
});

dashboard.on('predictionComplete', (prediction) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'predictionResult',
        data: prediction
      }));
    }
  });
});

dashboard.on('priceUpdate', (priceData) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'priceUpdate',
        data: priceData
      }));
    }
  });
});

dashboard.on('chartUpdate', (chartData) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'chartUpdate',
        data: chartData
      }));
    }
  });
});

// REST API Endpoints
app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await dashboard.loadDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

app.post('/api/predict', async (req, res) => {
  try {
    await dashboard.runPrediction();
    res.json({ message: 'Prediction started' });
  } catch (error) {
    res.status(500).json({ error: 'Prediction failed' });
  }
});

app.get('/api/last-prediction', (req, res) => {
  if (dashboard.lastPrediction) {
    res.json(dashboard.lastPrediction);
  } else {
    res.status(404).json({ error: 'No prediction available' });
  }
});

// Simulate real-time price updates
setInterval(() => {
  dashboard.simulatePriceUpdate();
}, 30000);

// Initialize dashboard
dashboard.loadDashboardData();

// Start HTTP server
app.listen(PORT, () => {
  console.log(`HTTP Server running on http://localhost:${PORT}`);
  console.log(`WebSocket Server running on ws://localhost:${WS_PORT}`);
});
