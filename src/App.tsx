import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  APIProvider, 
  Map, 
  useMap, 
  useMapsLibrary, 
  AdvancedMarker, 
  InfoWindow, 
  Pin,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { Marker } from '@googlemaps/markerclusterer';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Clock, 
  Beer, 
  Scan, 
  TrendingUp, 
  Music, 
  MapPin, 
  Navigation,
  X,
  CheckCircle2,
  Trash2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { Venue, VenueStats, VibeReport } from './types';

// Constants
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  'AIzaSyDDSu2Rqa-B48ZrxAxAannjag4hB-LZJc4';
const MAP_ID = 
  process.env.GOOGLE_MAPS_ID || 
  'A9KwG_Od5YC8Ak-vO10iVgO7eGw=';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

// Navigation types
type View = 'map' | 'list' | 'detail';

export default function App() {
  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#050505] text-white font-sans p-6">
        <div className="text-center max-w-lg bg-[#111] border border-white/10 p-10 rounded-[3rem] shadow-2xl">
          <div className="mb-8 flex justify-center">
            <div className="w-16 h-16 bg-[#00FF00]/10 rounded-full flex items-center justify-center animate-pulse">
              <MapPin className="text-[#00FF00]" size={32} />
            </div>
          </div>
          <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-6 leading-tight">Google Maps API Key Required</h2>
          <div className="space-y-6 text-left">
            <p className="text-sm text-white/60 leading-relaxed italic border-l-2 border-[#00FF00] pl-4">
              <strong>Step 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener" className="text-[#00FF00] underline decoration-[#00FF00]/30 underline-offset-4 hover:decoration-[#00FF00]">Get an API Key</a>
            </p>
            <p className="text-sm text-white/60 leading-relaxed italic border-l-2 border-[#00FF00] pl-4">
              <strong>Step 2:</strong> Add your key as a secret in AI Studio:
            </p>
            <ul className="text-xs text-white/40 space-y-3 font-mono bg-black/40 p-6 rounded-2xl border border-white/5">
              <li>1. Open <strong className="text-white/60">Settings</strong> (⚙️ gear icon, top-right)</li>
              <li>2. Select <strong className="text-white/60">Secrets</strong></li>
              <li>3. Name: <code className="bg-white/10 px-2 py-0.5 rounded text-[#00FF00]">GOOGLE_MAPS_PLATFORM_KEY</code></li>
              <li>4. Value: <code className="bg-white/10 px-2 py-0.5 rounded text-[#00FF00]">Your API Key</code></li>
            </ul>
          </div>
          <p className="mt-10 text-[10px] uppercase tracking-[0.3em] text-white/20 italic">VibeCheck restarts automatically after setup</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <VibeCheckMain />
    </APIProvider>
  );
}

function VibeCheckMain() {
  const [view, setView] = useState<View>('map');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [stats, setStats] = useState<VenueStats[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const lastFetchedLocation = useRef<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          fetchVenues(loc.lat, loc.lng);
          fetchStats(loc.lat, loc.lng);
        },
        (err) => {
          console.warn("Geolocation failed", err);
          // Do not set fallback location, let the user know location is needed
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    }
    
    const interval = setInterval(() => {
      if (userLocation) {
        fetchStats(userLocation.lat, userLocation.lng);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [userLocation?.lat, userLocation?.lng]);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const deg2rad = (deg: number) => deg * (Math.PI / 180);
    const R = 6371; // km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const sortedVenues = [...venues].sort((a, b) => {
    if (!userLocation) return 0;
    const distA = getDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
    const distB = getDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
    return distA - distB;
  }).filter(v => {
    if (!userLocation) return false; // Strict: Don't show anything until location is established
    const dist = getDistance(userLocation.lat, userLocation.lng, v.location.lat, v.location.lng);
    return dist < 5; // Only show vibes within 5km of live location
  });

  const fetchVenues = async (lat?: number, lng?: number) => {
    // Prevent excessive fetching if location hasn't changed much
    if (lat && lng && lastFetchedLocation.current) {
      const dLat = Math.abs(lat - lastFetchedLocation.current.lat);
      const dLng = Math.abs(lng - lastFetchedLocation.current.lng);
      if (dLat < 0.0005 && dLng < 0.0005) return; // approx 50m
    }

    try {
      if (!lat || !lng) return;
      lastFetchedLocation.current = { lat, lng };
      const url = `/api/venues?lat=${lat}&lng=${lng}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        setVenues(prev => {
          // Cumulative discovery: keep track of all venues seen in this session
          const existingIds = new Set(prev.map(v => v.id));
          const newlyDiscovered = data.filter((nv: Venue) => !existingIds.has(nv.id));
          return [...prev, ...newlyDiscovered];
        });
      }
    } catch (err) {
      console.warn("Satellite link unstable:", err instanceof Error ? err.message : String(err));
    }
  };

  const fetchStats = async (lat?: number, lng?: number) => {
    try {
      if (!lat || !lng) return;
      const url = `/api/stats?lat=${lat}&lng=${lng}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.warn("Intelligence sync degraded:", err instanceof Error ? err.message : String(err));
    }
  };

  const handleReportSuccess = () => {
    setIsReporting(false);
    fetchStats();
  };

  return (
    <div className="h-screen bg-[#050505] text-white overflow-hidden flex flex-col font-sans select-none selection:bg-[#00FF00] selection:text-black">
      {/* Header */}
      <header className="p-6 pt-10 flex justify-between items-center z-50 bg-gradient-to-b from-[#050505] to-transparent pointer-events-none">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">VibeCheck</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00FF00] shadow-[0_0_8px_#00FF00] animate-pulse" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00FF00]">Operational Network Live</p>
          </div>
        </motion.div>
        <button 
          className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors pointer-events-auto shadow-2xl backdrop-blur-xl"
        >
          <Scan size={18} className="text-white/80" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          {view === 'map' && (
            <motion.div 
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-0 bg-[#0A0A0A]"
            >
              <VibeMap 
                venues={venues} 
                stats={stats} 
                userLocation={userLocation}
                onFetchNearby={(lat, lng) => fetchVenues(lat, lng)}
                onVenueSelect={(v) => {
                  setSelectedVenue(v);
                  setView('detail'); 
                }}
              />
            </motion.div>
          )}

          {view === 'list' && (
            <motion.div 
              key="list"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="absolute inset-0 z-40 bg-[#050505]/95 backdrop-blur-2xl p-6 pt-24 overflow-y-auto"
            >
              <div className="flex items-center gap-3 mb-8">
                <TrendingUp size={20} className="text-[#00FF00]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">Live Intelligence Feed</h2>
              </div>
              {!userLocation ? (
                <div className="p-12 text-center border border-[#00FF00]/20 bg-[#00FF00]/5 rounded-[2rem] flex flex-col items-center gap-6 animate-pulse">
                  <Navigation size={32} className="text-[#00FF00]" />
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-[#00FF00] font-black">Awaiting GPS Lock</p>
                    <p className="text-xs text-white/40 italic leading-relaxed">Intelligence requires active localization <br/> to neutralize static noise.</p>
                  </div>
                </div>
              ) : Array.isArray(sortedVenues) && sortedVenues.length > 0 ? (
                sortedVenues.map(venue => (
                  <VenueStatsCard 
                    key={venue.id} 
                    venue={venue} 
                    stats={stats.find(s => s.venueId === venue.id)} 
                    onReport={() => {
                      setSelectedVenue(venue);
                      setIsReporting(true);
                    }}
                    onAnalyze={() => {
                      setSelectedVenue(venue);
                      setView('detail');
                    }}
                  />
                ))
              ) : (
                <div className="p-12 text-center border border-white/5 bg-white/5 rounded-[2rem] flex flex-col items-center gap-4">
                  <TrendingUp size={24} className="text-white/10" />
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 italic text-center leading-relaxed"> No localized intelligence <br/> recovered in this zone (5km) </p>
                </div>
              )}
            </motion.div>
          )}

          {view === 'detail' && selectedVenue && (
            <VenueDetailView 
              venue={selectedVenue} 
              stats={stats.find(s => s.venueId === selectedVenue.id)}
              onBack={() => setView('list')}
              onReport={() => setIsReporting(true)}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Dock */}
      <nav className="p-8 pb-12 flex justify-center items-center z-50 bg-gradient-to-t from-[#050505] to-transparent">
        <div className="flex gap-4 p-2.5 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl">
          <NavButton active={view === 'map'} onClick={() => setView('map')} icon={<MapPin size={22} />} label="Map" />
          <NavButton active={view === 'list'} onClick={() => setView('list')} icon={<TrendingUp size={22} />} label="Vibes" />
        </div>
      </nav>

      {/* Overlay Screens */}
      <AnimatePresence>
        {isReporting && selectedVenue && (
          <ReportModal 
            venue={selectedVenue} 
            onClose={() => setIsReporting(false)} 
            onSuccess={handleReportSuccess}
          />
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .gm-style-iw { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .gm-style-iw-c { background: #111 !important; color: white !important; border: 1px solid rgba(255,255,255,0.2) !important; border-radius: 12px !important; max-width: 300px !important; padding: 0 !important; }
        .gm-style-iw-tc::after { background: #111 !important; }
        .gm-style-iw-d { overflow: hidden !important; }
        .gm-ui-hover-text { display: none !important; }
        .gm-style-cc { display: none !important; }
        .marker-cluster-custom { background: transparent !important; border: none !important; }
      `}} />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-8 py-4 rounded-full flex flex-col items-center justify-center transition-all duration-500 gap-1.5 ${
        active 
          ? 'bg-[#00FF00] text-black shadow-[0_10px_30px_rgba(0,255,0,0.3)]' 
          : 'text-white/40 hover:text-white/80'
      }`}
    >
      {icon}
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function VibeMap({ venues, stats, onVenueSelect, userLocation, onFetchNearby }: { 
  venues: Venue[], 
  stats: VenueStats[],
  onVenueSelect: (v: Venue) => void,
  userLocation: {lat: number, lng: number} | null,
  onFetchNearby: (lat: number, lng: number) => void
}) {
  const map = useMap();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitiallyCentered = useRef(false);

  useEffect(() => {
    if (userLocation && map && !hasInitiallyCentered.current) {
      map.setCenter(userLocation);
      hasInitiallyCentered.current = true;
    }
  }, [userLocation, map]);

  return (
    <Map
      id="vibe-map"
      defaultCenter={userLocation || { lat: 0, lng: 0 }}
      defaultZoom={15}
      mapId={MAP_ID}
      style={{ width: '100%', height: '100%' }}
      disableDefaultUI
      gestureHandling="greedy"
      onCameraChanged={(ev) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          onFetchNearby(ev.detail.center.lat, ev.detail.center.lng);
        }, 500); // 500ms debounce
      }}
    >
      <ClusteredMarkers 
        venues={venues} 
        stats={stats} 
        onVenueSelect={onVenueSelect} 
      />
    </Map>
  );
}

function ClusteredMarkers({ venues, stats, onVenueSelect }: { 
  venues: Venue[], 
  stats: VenueStats[],
  onVenueSelect: (v: Venue) => void 
}) {
  const map = useMap();
  const [markers, setMarkers] = useState<{[key: string]: Marker}>({});
  const clusterer = useRef<MarkerClusterer | null>(null);

  // Initialize MarkerClusterer
  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({ map });
    }
  }, [map]);

  // Update clusters when markers or map changes
  useEffect(() => {
    clusterer.current?.clearMarkers();
    clusterer.current?.addMarkers(Object.values(markers));
  }, [markers]);

  const setMarkerRef = useCallback((marker: Marker | null, key: string) => {
    setMarkers(prev => {
      if (marker) {
        if (prev[key] === marker) return prev;
        return {...prev, [key]: marker};
      } else {
        if (!prev[key]) return prev;
        const next = {...prev};
        delete next[key];
        return next;
      }
    });
  }, []);

  return (
    <>
      {venues.map(venue => (
        <VenueMarker 
          key={venue.id} 
          id={venue.id}
          venue={venue} 
          stats={stats.find(s => s.venueId === venue.id)}
          onVenueSelect={onVenueSelect}
          onMarkerAdd={setMarkerRef}
        />
      ))}
    </>
  );
}

interface VenueMarkerProps {
  key?: React.Key;
  id: string;
  venue: Venue;
  stats?: VenueStats;
  onVenueSelect: (v: Venue) => void;
  onMarkerAdd: (m: Marker | null, id: string) => void;
}

function VenueMarker({ id, venue, stats, onVenueSelect, onMarkerAdd }: VenueMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoWindowOpen, setInfoWindowOpen] = useState(false);
  
  const density = stats?.avgCrowdDensity || 0;
  const color = density > 70 ? "#FF0000" : density > 40 ? "#FFA500" : "#00FF00";
  const isLively = density > 65;

  // Pass marker to clusterer
  useEffect(() => {
    if (marker) {
      onMarkerAdd(marker as unknown as Marker, id);
    }
    return () => onMarkerAdd(null, id);
  }, [marker, id, onMarkerAdd]);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: venue.location.lat, lng: venue.location.lng }}
        title={venue.name}
        onClick={() => setInfoWindowOpen(true)}
      >
        <div className="relative group">
          {/* Energy Pulse Rings - Intensify with density */}
          {(density > 40) && (
            <div 
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ 
                backgroundColor: color,
                animationDuration: density > 75 ? '1s' : '2s'
              }} 
            />
          )}
          {density > 75 && (
            <div 
              className="absolute -inset-2 rounded-full animate-ping opacity-10"
              style={{ backgroundColor: color, animationDuration: '1.5s', animationDelay: '0.5s' }} 
            />
          )}

          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-black/40 shadow-[0_0_25px_rgba(0,0,0,0.5)] transition-all hover:scale-125 hover:z-50 active:scale-95 cursor-pointer relative z-10"
            style={{ backgroundColor: color }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_12px_white] animate-pulse" />
          </div>
          
          {isLively && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-black border border-white/20 rounded-full flex items-center justify-center animate-bounce shadow-2xl overflow-hidden z-20">
               <div className="absolute inset-0 bg-[#FF0000] opacity-20 animate-pulse" />
               <TrendingUp size={10} className="text-[#FF0000] relative z-10" />
            </div>
          )}
        </div>
      </AdvancedMarker>

      {infoWindowOpen && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => setInfoWindowOpen(false)}
        >
          <div className="p-4 min-w-[260px] max-w-[300px] bg-[#0A0A0A] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden rounded-xl">
            <div className="max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
              <div className="flex justify-between items-start mb-4 sticky top-0 bg-[#0A0A0A] py-1 z-10">
                <div>
                  <h4 className="font-black italic uppercase leading-none text-xl text-white tracking-tighter mb-1">{venue.name}</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{venue.category}</p>
                  </div>
                </div>
                {isLively && (
                  <div className="flex items-center gap-1 bg-[#FF0000]/10 px-2 py-1 rounded-md border border-[#FF0000]/20 animate-pulse">
                    <TrendingUp size={10} className="text-[#FF0000]" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#FF0000]">Peak</span>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-white/40 italic leading-relaxed mb-6 border-l border-[#00FF00]/30 pl-3">
                {venue.description}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6 pt-4 border-t border-white/5">
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <p className="text-[7px] uppercase text-white/30 mb-0.5 font-black tracking-widest flex items-center gap-1">
                    <Clock size={8} /> Wait Time
                  </p>
                  <p className="text-sm font-black italic text-white font-mono">{stats?.avgQueueTime || 0}m</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <p className="text-[7px] uppercase text-white/30 mb-0.5 font-black tracking-widest flex items-center gap-1">
                    <Users size={8} /> Occupancy
                  </p>
                  <p className="text-sm font-black italic font-mono" style={{ color }}>{density}%</p>
                </div>
              </div>

              <div className="space-y-2 pb-2">
                <a 
                  href={`https://www.google.com/maps/dir/?api=1&destination=${venue.location.lat},${venue.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-4 bg-[#00FF00] hover:bg-white text-black transition-all rounded-xl text-[10px] font-black uppercase tracking-[0.2em] no-underline shadow-[0_5px_15px_rgba(0,255,0,0.2)]"
                >
                  <Navigation size={12} fill="currentColor" />
                  GPS Navigation
                </a>
                <button 
                  onClick={() => {
                    onVenueSelect(venue);
                    setInfoWindowOpen(false);
                  }}
                  className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-1.5"
                >
                  Full Intel Report <ChevronRight size={10} />
                </button>
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface VenueStatsCardProps {
  key?: React.Key;
  venue: Venue;
  stats?: VenueStats;
  onReport: () => void;
  onAnalyze: () => void;
}

function VenueStatsCard({ venue, stats, onReport, onAnalyze }: VenueStatsCardProps) {
  const density = stats?.avgCrowdDensity || 0;
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-[#111] border border-white/10 rounded-[2.5rem] p-8 mb-6 relative overflow-hidden group hover:border-[#00FF00]/30 transition-all shadow-xl"
    >
      {/* Dynamic Background Glow */}
      <div 
        className="absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-10 transition-all duration-700 group-hover:opacity-20"
        style={{ 
          backgroundColor: density > 70 ? '#FF0000' : density > 40 ? '#FFA500' : '#00FF00' 
        }} 
      />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-10">
          <div>
            <h3 className="text-4xl font-black italic uppercase tracking-tighter leading-none mb-3 pr-10">{venue.name}</h3>
            <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-white/40 italic flex items-center gap-2">
              <MapPin size={10} className="text-[#00FF00]" /> {venue.category}
            </p>
            {venue.openingHours && (
              <div className="mt-6 p-4 bg-white/5 border-l-2 border-[#00FF00] rounded-r-2xl flex items-center gap-4 group/hours transition-colors hover:bg-white/10">
                 <div className="p-2 bg-[#00FF00]/10 rounded-lg">
                   <Clock size={14} className="text-[#00FF00]" /> 
                 </div>
                 <div className="flex flex-col min-w-0">
                   <span className="text-[7px] font-black uppercase tracking-[0.3em] text-[#00FF00]/40 mb-1">Operational Windows</span>
                   <p className="text-[10px] font-mono text-white/80 leading-tight truncate">
                     {venue.openingHours}
                   </p>
                 </div>
              </div>
            )}
          </div>
          <button 
            onClick={onAnalyze}
            className="p-3 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <TrendingUp size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatItem icon={<Clock size={16} />} label="Wait Time" value={`${stats?.avgQueueTime || 0}m`} />
          <StatItem icon={<Users size={16} />} label="Density" value={`${stats?.avgCrowdDensity || 0}%`} />
          <StatItem icon={<Beer size={16} />} label="Beer Cost" value={`${stats?.currencySymbol || "$"} ${stats?.avgPrice || 0}`} />
          <StatItem icon={<Music size={16} />} label="Atmosphere" value={stats?.topVibe || "Quiet"} isVibe />
        </div>

        <button 
          onClick={onReport}
          className="mt-10 w-full py-6 px-8 bg-white text-black rounded-[2rem] flex items-center justify-between group-hover:bg-[#00FF00] transition-all"
        >
          <div className="flex items-center gap-4">
            <Scan size={20} />
            <span className="text-xs font-black uppercase tracking-[0.3em]">Broadcast Intel</span>
          </div>
          <ChevronRight size={20} />
        </button>
      </div>
    </motion.div>
  );
}

function VenueDetailView({ venue, stats, onBack, onReport }: { venue: Venue, stats?: VenueStats, onBack: () => void, onReport: () => void }) {
  const density = stats?.avgCrowdDensity || 0;
  
  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] bg-[#050505] overflow-y-auto"
    >
      <div className="p-8 pt-24 pb-32 max-w-2xl mx-auto w-full">
        {/* Back navigation */}
        <button 
          onClick={onBack}
          className="mb-10 flex items-center gap-4 text-white/40 hover:text-[#00FF00] transition-colors group"
        >
          <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center group-hover:border-[#00FF00]/50 transition-all">
            <ChevronLeft size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Return to Feed</span>
        </button>

        {/* Tactical Header */}
        <div className="relative mb-12">
          <div 
            className="absolute -right-20 -top-20 w-80 h-80 blur-[120px] opacity-20 pointer-events-none"
            style={{ 
              backgroundColor: density > 70 ? '#FF0000' : density > 40 ? '#FFA500' : '#00FF00' 
            }} 
          />
          <h2 className="text-6xl font-black italic uppercase tracking-tighter leading-[0.8] mb-6">
            {venue.name}
          </h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-full">
              <MapPin size={12} className="text-[#00FF00]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#00FF00]">{venue.category}</span>
            </div>
            {stats?.isSatellite && (
              <div className="flex items-center gap-2 px-4 py-2 bg-[#00FF00]/10 border border-[#00FF00]/20 rounded-full">
                <Scan size={12} className="text-[#00FF00]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00FF00]">Satellite Intelligence</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          <StatItem icon={<Clock size={16} />} label="Current Wait" value={`${stats?.avgQueueTime || 0}m`} />
          <StatItem icon={<Users size={16} />} label="Density" value={`${stats?.avgCrowdDensity || 0}%`} />
          <StatItem icon={<Beer size={16} />} label="Unit Cost" value={`${stats?.currencySymbol || "$"} ${stats?.avgPrice || 0}`} />
          <StatItem icon={<Music size={16} />} label="Atmosphere" value={stats?.topVibe || "Quiet"} isVibe />
        </div>

        {/* Intelligence Detail Cards */}
        <div className="space-y-4">
          <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-10">
            {/* Description Section */}
            <div className="flex items-start gap-6">
              <div className="w-12 h-12 bg-[#00FF00]/10 rounded-2xl flex items-center justify-center shrink-0 border border-[#00FF00]/20 shadow-[0_0_15px_rgba(0,255,0,0.1)]">
                <TrendingUp size={20} className="text-[#00FF00]" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Tactical Profile</p>
                <div className="relative">
                  <div className="absolute -left-6 top-0 bottom-0 w-[1px] bg-gradient-to-b from-[#00FF00] via-[#00FF00]/20 to-transparent" />
                  <p className="text-[15px] text-white/80 leading-relaxed italic font-medium pl-2">
                    {venue.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Hours Section */}
            <div className="flex items-start gap-6 border-t border-white/5 pt-10">
              <div className="w-12 h-12 bg-[#00FF00]/10 rounded-2xl flex items-center justify-center shrink-0 border border-[#00FF00]/20">
                <Clock size={20} className="text-[#00FF00]" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Operational Windows</p>
                <p className="text-[13px] text-white/90 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5">
                  {venue.openingHours || "Schedule synchronization failed. Local intelligence required."}
                </p>
              </div>
            </div>

            {/* Contact Section */}
            {(venue.phone || venue.website) && (
              <div className="flex items-start gap-6 border-t border-white/5 pt-10">
                <div className="w-12 h-12 bg-[#00FF00]/10 rounded-2xl flex items-center justify-center shrink-0 border border-[#00FF00]/20">
                  <Scan size={20} className="text-[#00FF00]" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-4">Communication Protocols</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {venue.phone && (
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                        <p className="text-[8px] font-black uppercase text-[#00FF00]/40 mb-1">Direct Link</p>
                        <p className="text-[13px] text-white font-mono">{venue.phone}</p>
                      </div>
                    )}
                    {venue.website && (
                      <a 
                        href={venue.website.startsWith('http') ? venue.website : `https://${venue.website}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="bg-white/5 p-4 rounded-2xl border border-white/5 block hover:bg-[#00FF00]/10 group transition-all"
                      >
                         <p className="text-[8px] font-black uppercase text-[#00FF00]/40 mb-1">Digital Access</p>
                         <div className="flex items-center justify-between">
                           <span className="text-[13px] text-[#00FF00] font-mono group-hover:text-white">Portal Open</span>
                           <ChevronRight size={14} className="text-white/20 group-hover:text-[#00FF00]" />
                         </div>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global CTAs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pb-10">
          <a 
            href={`https://www.google.com/maps/dir/?api=1&destination=${venue.location.lat},${venue.location.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-4 py-6 bg-[#00FF00] hover:bg-white text-black transition-all rounded-[2rem] text-xs font-black uppercase tracking-[0.3em] no-underline shadow-[0_15px_40px_rgba(0,255,0,0.2)]"
          >
            <Navigation size={18} fill="currentColor" />
            Launch Navigation
          </a>
          <button 
            onClick={onReport}
            className="py-6 px-8 bg-white/5 border border-white/10 text-white rounded-[2rem] flex items-center justify-center gap-4 hover:bg-white/10 transition-all font-black uppercase text-xs tracking-[0.3em]"
          >
            <Scan size={18} />
            Update Intel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatItem({ icon, label, value, isVibe }: { icon: React.ReactNode, label: string, value: string, isVibe?: boolean }) {
  return (
    <div className="bg-white/5 border border-white/5 rounded-3xl p-5 flex flex-col items-start gap-4 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-2 text-white/30 uppercase tracking-[0.2em] text-[8px] font-black">
        {icon}
        {label}
      </div>
      <div className={`font-mono text-2xl font-black leading-none ${isVibe ? 'italic text-sm uppercase' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function ReportModal({ venue, onClose, onSuccess }: { venue: Venue, onClose: () => void, onSuccess: () => void }) {
  const [step, setStep] = useState(1);
  const currency = "$";
  const defaultPrice = 7;

  const [data, setData] = useState<Partial<VibeReport>>({
    venueId: venue.id,
    queueTime: 15,
    crowdDensity: 50,
    priceOfBeer: defaultPrice,
    vibe: 'Electronic'
  });

  const vibes = ["Electronic", "Hip Hop", "Rock", "Pop", "Jazz", "Chill", "Alternative", "RnB"];

  const submit = async () => {
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 z-[2000] p-6 flex flex-col pt-12 overflow-y-auto"
    >
      <div className="flex justify-between items-center mb-10 shrink-0">
        <div>
          <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Intelligence</h2>
          <p className="text-[#00FF00] text-[10px] uppercase tracking-widest mt-2">Uploading from: {venue.name}</p>
        </div>
        <div className="flex gap-4">
           {step === 2 && (
             <button onClick={() => setStep(1)} className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors">
               <ChevronLeft size={20} />
             </button>
           )}
           <button onClick={onClose} className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors">
             <X size={20} />
           </button>
        </div>
      </div>

      <div className="flex-1 space-y-12 max-w-md mx-auto w-full pb-10">
        {step === 1 && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-12">
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00FF00]">Wait Time (min)</label>
                <span className="font-mono text-3xl font-black font-mono">{data.queueTime}m</span>
              </div>
              <input 
                type="range" min="0" max="60" step="5"
                value={data.queueTime}
                onChange={e => setData({...data, queueTime: Number(e.target.value)})}
                className="w-full accent-[#00FF00] h-3 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00FF00]">Crowd Density</label>
                <span className="font-mono text-3xl font-black font-mono">{data.crowdDensity}%</span>
              </div>
              <input 
                type="range" min="0" max="100" step="10"
                value={data.crowdDensity}
                onChange={e => setData({...data, crowdDensity: Number(e.target.value)})}
                className="w-full accent-[#00FF00] h-3 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00FF00]">Price of Beer ({currency})</label>
                <span className="font-mono text-3xl font-black font-mono">{data.priceOfBeer}</span>
              </div>
              <input 
                type="range" min="2" max="25" step="1"
                value={data.priceOfBeer}
                onChange={e => setData({...data, priceOfBeer: Number(e.target.value)})}
                className="w-full accent-[#00FF00] h-3 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <button onClick={() => setStep(2)} className="w-full py-6 bg-[#00FF00] text-black text-xs font-black uppercase tracking-[0.3em] rounded-3xl shadow-[0_10px_30px_rgba(0,255,0,0.3)] hover:brightness-110 active:scale-[0.98] transition-all">
              Continue
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-12">
            <div className="space-y-8">
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00FF00]">Analyze Atmosphere</label>
              <div className="grid grid-cols-2 gap-3">
                {vibes.map(v => (
                  <button
                    key={v}
                    onClick={() => setData({...data, vibe: v})}
                    className={`py-5 border-2 transition-all rounded-3xl text-[10px] font-black uppercase tracking-widest ${
                      data.vibe === v 
                        ? 'bg-[#00FF00] border-[#00FF00] text-black shadow-[0_0_20px_rgba(0,255,0,0.4)]' 
                        : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <button 
              onClick={submit}
              className="w-full py-8 bg-[#00FF00] text-black text-xs font-black uppercase tracking-[0.3em] rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,255,0,0.4)] flex items-center justify-center gap-6 group hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <CheckCircle2 size={24} />
              Transmit Report
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
