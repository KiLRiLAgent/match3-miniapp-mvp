/**
 * Location registry — single source of truth for all LocationDef instances
 * loaded into v2. Keyed by `LocationDef.id`. Add new locations by importing
 * them here.
 */

import type { LocationDef } from "../types";
import { atrium } from "./atrium";

export const LOCATIONS: Record<string, LocationDef> = {
  atrium,
};
