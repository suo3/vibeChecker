/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Venue {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  category: string;
  description: string;
  openingHours?: string;
  phone?: string;
  website?: string;
}

export interface VibeReport {
  id: string;
  venueId: string;
  timestamp: number;
  queueTime: number; // in minutes
  crowdDensity: number; // 0-100 percentage
  priceOfBeer: number; // numeric value
  vibe: string; // e.g., "Amapiano", "Chill", "High Energy"
  isVerified: boolean;
}

export interface VenueStats {
  venueId: string;
  avgQueueTime: number;
  avgCrowdDensity: number;
  avgPrice: number;
  topVibe: string;
  reportCount: number;
  lastUpdate: number;
  isSatellite?: boolean;
  currencySymbol?: string;
}
