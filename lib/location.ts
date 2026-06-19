export async function reverseGeocodeToPlace(latitude: number, longitude: number, branch?: string | null) {
  const branchName = String(branch || "").trim();
  return branchName || `Latitude ${latitude.toFixed(5)}, Longitude ${longitude.toFixed(5)}`;
}
