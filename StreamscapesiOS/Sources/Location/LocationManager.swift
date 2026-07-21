import CoreLocation
import Observation

struct Airport {
    let lat: Double
    let lon: Double
    let label: String
}

private let airports: [Airport] = [
    Airport(lat: 52.5600, lon: 13.2877, label: "Berlin (BER)"),
    Airport(lat: 51.4700, lon: -0.4543, label: "London (LHR)"),
    Airport(lat: 35.7647, lon: 140.3864, label: "Tokyo (NRT)"),
    Airport(lat: 37.6213, lon: -122.3790, label: "San Francisco (SFO)"),
    Airport(lat: 40.6413, lon: -73.7781, label: "New York (JFK)"),
    Airport(lat: 25.2532, lon: 55.3657, label: "Dubai (DXB)"),
    Airport(lat: -33.9461, lon: 151.1772, label: "Sydney (SYD)"),
    Airport(lat: 1.3644, lon: 103.9915, label: "Singapore (SIN)"),
    Airport(lat: 19.0896, lon: 72.8656, label: "Mumbai (BOM)"),
    Airport(lat: -23.4356, lon: -46.4731, label: "São Paulo (GRU)"),
]

@MainActor
@Observable
final class LocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    var latitude: Double
    var longitude: Double
    var hasLocation = false
    var denied = false
    var randomAirportLabel: String?
    var bannerDismissed = false

    override init() {
        let airport = airports.randomElement()!
        latitude = airport.lat
        longitude = airport.lon
        randomAirportLabel = airport.label
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestLocation() {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if status == .authorizedWhenInUse || status == .authorizedAlways {
            manager.startUpdatingLocation()
        } else {
            denied = true
            print("[Location] Authorization denied, using random airport: \(randomAirportLabel ?? "?")")
        }
    }

    func dismissBanner() {
        bannerDismissed = true
    }

    nonisolated func locationManagerDidChangeAuthorization(_ mgr: CLLocationManager) {
        let status = mgr.authorizationStatus
        Task { @MainActor in
            print("[Location] Authorization changed: \(status.rawValue)")
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                self.denied = false
                self.manager.startUpdatingLocation()
            } else if status == .denied || status == .restricted {
                self.denied = true
            }
        }
    }

    nonisolated func locationManager(_ mgr: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let lat = loc.coordinate.latitude
        let lon = loc.coordinate.longitude
        Task { @MainActor in
            self.latitude = lat
            self.longitude = lon
            self.hasLocation = true
            self.randomAirportLabel = nil
            self.denied = false
            self.manager.stopUpdatingLocation()
            print("[Location] Got location: \(lat), \(lon)")
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Location] Failed: \(error.localizedDescription)")
    }
}
