import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Venue, VibeReport, VenueStats } from "./src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// Ghost Engine: In-memory store
let reports: VibeReport[] = [];

// Cache for venues.
let discoveredVenues: Venue[] = [];

// Helper to calculate distance
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const deg2rad = (deg: number) => deg * (Math.PI / 180);
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Helper to calculate stats
function getVenueStats(venueId: string): VenueStats {
  const venue = discoveredVenues.find(v => v.id === venueId);
  const venueReports = reports.filter(r => r.venueId === venueId);

  // Generic localization logic
  const currencySymbol = "$";
  const baseBeerPrice = 7; 

  if (venueReports.length === 0) {
    // Satellite Intelligence: Estimate based on time and category
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); 
    
    let baseDensity = 10;
    let baseQueue = 0;
    
    const isPeakTime = hour >= 22 || hour <= 3;
    const isWeekend = day === 5 || day === 6;
    
    if (isPeakTime) {
      baseDensity = isWeekend ? 85 : 55;
      baseQueue = isWeekend ? 35 : 15;
    } else if (hour >= 18 && hour < 22) {
      baseDensity = isWeekend ? 50 : 30;
    }

    const jitter = (venueId.length * 7) % 20;
    
    return {
      venueId,
      avgQueueTime: Math.max(0, baseQueue + (jitter % 10)),
      avgCrowdDensity: Math.min(100, baseDensity + jitter),
      avgPrice: baseBeerPrice + (jitter % 3),
      topVibe: isPeakTime ? "High Energy" : "Technical",
      reportCount: 0,
      lastUpdate: Date.now(),
      isSatellite: true,
      currencySymbol
    };
  }

  const avgQueueTime = Math.round(venueReports.reduce((acc, r) => acc + r.queueTime, 0) / venueReports.length);
  const avgCrowdDensity = Math.round(venueReports.reduce((acc, r) => acc + r.crowdDensity, 0) / venueReports.length);
  const avgPrice = Number((venueReports.reduce((acc, r) => acc + r.priceOfBeer, 0) / venueReports.length).toFixed(2));
  
  const vibeCounts = venueReports.reduce((acc, r) => {
    acc[r.vibe] = (acc[r.vibe] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topVibe = vibeCounts && Object.keys(vibeCounts).length > 0 
    ? Object.entries(vibeCounts).sort((a, b) => b[1] - a[1])[0][0]
    : "Quiet";

  return {
    venueId,
    avgQueueTime,
    avgCrowdDensity,
    avgPrice,
    topVibe,
    reportCount: venueReports.length,
    lastUpdate: Math.max(...venueReports.map(r => r.timestamp)),
    isSatellite: false,
    currencySymbol
  };
}

// Ghost Engine: Auto-wipe at 6 AM
function checkAndWipe() {
  const now = new Date();
  if (now.getHours() === 6 && now.getMinutes() === 0) {
    console.log("6 AM: Ghost Engine wiping records...");
    reports = [];
  }
}
setInterval(checkAndWipe, 60000); // Check every minute

// API Routes
app.get("/api/venues", async (req, res) => {
  const { lat, lng } = req.query;
  
  if (!lat || !lng) {
    return res.status(400).json({ error: "Latitude and longitude are required for localized intelligence." });
  }

  try {
    // Overpass API Query: Find bars, pubs, nightclubs, restaurants, and cafes within 3000m
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"bar|pub|nightclub|restaurant|cafe"](around:5000,${lat},${lng});
        way["amenity"~"bar|pub|nightclub|restaurant|cafe"](around:5000,${lat},${lng});
      );
      out center;
    `;

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://lz4.overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.nchc.org.tw/api/interpreter",
      "https://overpass.osm.ch/api/interpreter",
      "https://overpass.openstreetmap.ru/cgi/interpreter",
      "https://z.overpass-api.de/api/interpreter"
    ].sort(() => Math.random() - 0.5);

    let data;
    for (const endpoint of endpoints) {
      try {
        const url = `${endpoint}?data=${encodeURIComponent(query)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout per endpoint
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (VibeCheck Tactical Scanner; Intelligence/1.0)',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            data = await response.json();
            if (data && data.elements) break; // Valid data found
          } else {
            console.warn(`Endpoint ${endpoint} returned non-JSON response`);
          }
        } else {
          console.warn(`Overpass endpoint ${endpoint} returned status: ${response.status}`);
          // If rate limited (429), don't waste time retrying this one immediately
        }
      } catch (e) {
        console.warn(`Overpass endpoint ${endpoint} failed:`, e instanceof Error ? e.message : String(e));
      }
    }

    if (!data || !data.elements) {
      // If Overpass fails, only return venues near the requested location from history
      const nearbyDiscovered = discoveredVenues.filter(v => {
        const dist = getDistance(Number(lat), Number(lng), v.location.lat, v.location.lng);
        return dist < 5; // 5km radius for fallback
      });
      return res.json(nearbyDiscovered.length > 0 ? nearbyDiscovered : []);
    }

    const newVenues: Venue[] = data.elements.map((el: any) => ({
      id: el.id.toString(),
      name: el.tags.name || "Unnamed Venue",
      location: {
        lat: el.lat || (el.center ? el.center.lat : 0),
        lng: el.lon || (el.center ? el.center.lon : 0),
      },
      category: el.tags.amenity ? (el.tags.amenity.charAt(0).toUpperCase() + el.tags.amenity.slice(1)) : "Venue",
      description: el.tags.cuisine || el.tags.description || "Nightlife spot",
      openingHours: el.tags.opening_hours,
      phone: el.tags.phone || el.tags["contact:phone"],
      website: el.tags.website || el.tags["contact:website"]
    })).filter((v: Venue) => v.location.lat !== 0);

    // Merge with existing discovered venues to keep history
    newVenues.forEach(nv => {
      if (!discoveredVenues.find(dv => dv.id === nv.id)) {
        discoveredVenues.push(nv);
      }
    });

    res.json(newVenues);
  } catch (err) {
    console.error("Overpass error:", err);
    // Fallback logic
    const nearbyFallback = discoveredVenues.filter(v => {
      const dist = getDistance(Number(lat), Number(lng), v.location.lat, v.location.lng);
      return dist < 5;
    });
    res.json(nearbyFallback);
  }
});

app.get("/api/stats", (req, res) => {
  const { lat, lng } = req.query;
  
  let venuesToStat = discoveredVenues;
  
  if (lat && lng) {
    venuesToStat = discoveredVenues.filter(v => {
      const dist = getDistance(Number(lat), Number(lng), v.location.lat, v.location.lng);
      return dist < 5; // 5km radius for stats
    });
  } else {
     // If no location, return nothing or very limited
     return res.json([]);
  }

  const allStats = venuesToStat.map(v => getVenueStats(v.id));
  res.json(allStats);
});

app.post("/api/report", (req, res) => {
  const report: VibeReport = {
    ...req.body,
    id: Math.random().toString(36).substring(7),
    timestamp: Date.now(),
    isVerified: true // In real app, check geolocation here
  };
  reports.push(report);
  res.status(201).json(report);
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VibeCheck Server running at http://localhost:${PORT}`);
  });
}

startServer();
