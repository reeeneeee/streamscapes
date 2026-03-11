import CoreLocation
import Observation

@MainActor
@Observable
final class LocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    var latitude: Double = 40.6681   // Brooklyn default
    var longitude: Double = -73.9822
    var hasLocation = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestLocation() {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
            // startUpdatingLocation will be called in didChangeAuthorization
        } else if status == .authorizedWhenInUse || status == .authorizedAlways {
            manager.startUpdatingLocation()
        } else {
            print("[Location] Authorization denied, using defaults")
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ mgr: CLLocationManager) {
        let status = mgr.authorizationStatus
        Task { @MainActor in
            print("[Location] Authorization changed: \(status.rawValue)")
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                self.manager.startUpdatingLocation()
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
            self.manager.stopUpdatingLocation()
            print("[Location] Got location: \(lat), \(lon)")
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Location] Failed: \(error.localizedDescription)")
    }
}
