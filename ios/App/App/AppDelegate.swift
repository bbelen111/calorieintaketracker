import UIKit
import Capacitor
import HealthKit
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Restore background HealthKit workout observer if previously enabled
        // so Apple Health can wake Energy Map for unimported workouts even
        // when the app was terminated.
        BackgroundWorkoutSyncManager.shared.restoreObserverIfEnabled()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}

/// Manages HealthKit `HKObserverQuery` + background delivery for detecting
/// unimported workouts while Energy Map is closed or suspended.
final class BackgroundWorkoutSyncManager {
    static let shared = BackgroundWorkoutSyncManager()

    private let enabledKey = "energyMapBgWorkoutEnabled"
    private let loggedIdsKey = "energyMapBgLoggedWorkoutIds"
    private let loggedWindowsKey = "energyMapBgLoggedSessionWindows"
    private let notifiedIdsKey = "energyMapBgNotifiedWorkoutIds"
    private let capNotifiedKey = "CapacitorStorage.energyMapNotifiedHealthWorkouts"
    private let notifSeqKey = "energyMapBgWorkoutNotifSeq"
    private let maxStoredIds = 80
    private let minWorkoutMinutes = 5
    private let overlapToleranceSeconds: TimeInterval = 5 * 60
    private let unimportedIdBase = 2200

    private let healthStore = HKHealthStore()
    private var observerQuery: HKObserverQuery?
    private let lock = NSLock()

    private init() {}

    var isHealthAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func restoreObserverIfEnabled() {
        let enabled = UserDefaults.standard.bool(forKey: enabledKey)
        if enabled {
            startObserver()
        }
    }

    func configure(
        enabled: Bool,
        loggedWorkoutIds: [String],
        loggedSessionWindows: [[String: Double]],
        notifiedWorkoutIds: [String]
    ) -> Bool {
        let defaults = UserDefaults.standard
        defaults.set(enabled, forKey: enabledKey)
        defaults.set(loggedWorkoutIds, forKey: loggedIdsKey)
        defaults.set(loggedSessionWindows, forKey: loggedWindowsKey)
        defaults.set(notifiedWorkoutIds, forKey: notifiedIdsKey)

        guard enabled, isHealthAvailable else {
            stopObserver()
            return false
        }
        startObserver()
        return true
    }

    private func startObserver() {
        guard isHealthAvailable else { return }

        lock.lock()
        let alreadyRunning = observerQuery != nil
        lock.unlock()
        if alreadyRunning {
            return
        }

        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { [weak self] _, completionHandler, error in
            guard let self = self else {
                completionHandler()
                return
            }
            if error != nil {
                completionHandler()
                return
            }
            self.checkRecentWorkouts(completion: completionHandler)
        }

        lock.lock()
        observerQuery = query
        lock.unlock()

        healthStore.execute(query)
        healthStore.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, error in
            if let error = error {
                CAPLog.print("[BackgroundWorkoutSync] enableBackgroundDelivery failed:", error.localizedDescription)
            }
        }
    }

    private func stopObserver() {
        lock.lock()
        let activeQuery = observerQuery
        observerQuery = nil
        lock.unlock()

        if let activeQuery = activeQuery {
            healthStore.stop(activeQuery)
        }
        if isHealthAvailable {
            healthStore.disableBackgroundDelivery(for: HKObjectType.workoutType()) { _, _ in }
        }
    }

    private func checkRecentWorkouts(completion: @escaping () -> Void) {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: enabledKey), isHealthAvailable else {
            completion()
            return
        }

        let now = Date()
        let lookbackStart = now.addingTimeInterval(-48 * 3600)
        let predicate = HKQuery.predicateForSamples(withStart: lookbackStart, end: now, options: [])
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        let sampleQuery = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: 50,
            sortDescriptors: [sortDescriptor]
        ) { [weak self] _, samples, error in
            defer { completion() }
            guard let self = self, error == nil, let workouts = samples as? [HKWorkout], !workouts.isEmpty else {
                return
            }

            let loggedIds = Set(defaults.stringArray(forKey: self.loggedIdsKey) ?? [])
            let loggedWindows = (defaults.array(forKey: self.loggedWindowsKey) as? [[String: Double]]) ?? []
            var notifiedList = self.loadMergedNotifiedIds()
            let notifiedSet = Set(notifiedList)

            let unimported = workouts.filter { workout in
                let id = workout.uuid.uuidString
                if notifiedSet.contains(id) || loggedIds.contains(id) {
                    return false
                }
                let durationMin = Int((workout.duration / 60.0).rounded())
                if durationMin < self.minWorkoutMinutes {
                    return false
                }
                return !self.overlapsLoggedSession(
                    start: workout.startDate,
                    end: workout.endDate,
                    windows: loggedWindows
                )
            }

            guard !unimported.isEmpty else { return }

            for workout in unimported {
                notifiedList.append(workout.uuid.uuidString)
            }
            if notifiedList.count > self.maxStoredIds {
                notifiedList = Array(notifiedList.suffix(self.maxStoredIds))
            }
            self.saveNotifiedIds(notifiedList)
            self.postUnimportedNotification(unimported)
        }

        healthStore.execute(sampleQuery)
    }

    private func loadMergedNotifiedIds() -> [String] {
        let defaults = UserDefaults.standard
        var merged: [String] = []
        var seen = Set<String>()

        for id in defaults.stringArray(forKey: notifiedIdsKey) ?? [] where seen.insert(id).inserted {
            merged.append(id)
        }
        if let rawJson = defaults.string(forKey: capNotifiedKey),
           let data = rawJson.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String] {
            for id in parsed where seen.insert(id).inserted {
                merged.append(id)
            }
        }
        return merged
    }

    private func saveNotifiedIds(_ ids: [String]) {
        let defaults = UserDefaults.standard
        defaults.set(ids, forKey: notifiedIdsKey)
        if let data = try? JSONSerialization.data(withJSONObject: ids),
           let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: capNotifiedKey)
        }
    }

    private func overlapsLoggedSession(start: Date, end: Date, windows: [[String: Double]]) -> Bool {
        let wStart = start.timeIntervalSince1970
        let wEnd = end.timeIntervalSince1970
        for window in windows {
            guard let sStartMs = window["startMs"], let sEndMs = window["endMs"] else { continue }
            let sStart = sStartMs / 1000.0
            let sEnd = sEndMs / 1000.0
            if sStart <= wEnd + overlapToleranceSeconds && sEnd >= wStart - overlapToleranceSeconds {
                return true
            }
        }
        return false
    }

    private func postUnimportedNotification(_ unimported: [HKWorkout]) {
        let count = unimported.count
        let first = unimported[0]
        let firstMinutes = max(1, Int((first.duration / 60.0).rounded()))
        let label = describeWorkoutType(first.workoutActivityType)

        let content = UNMutableNotificationContent()
        content.title = count == 1
            ? "Unimported workout detected"
            : "\(count) unimported workouts detected"
        content.body = count == 1
            ? "\(firstMinutes) min \(label) from Apple Health. Tap to import so today\u{2019}s TDEE includes it."
            : "Tap to import \(count) synced workouts from Apple Health into your activity log."
        content.sound = .default
        content.userInfo = [
            "cap_schedule": [:],
            "cap_extra": ["route": "open_cardio_import"]
        ]

        let defaults = UserDefaults.standard
        let seq = defaults.integer(forKey: notifSeqKey)
        let notifId = unimportedIdBase + (seq % 50)
        defaults.set((seq + 1) % 50, forKey: notifSeqKey)

        let request = UNNotificationRequest(identifier: "\(notifId)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    private func describeWorkoutType(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .cycling: return "cycling"
        case .walking: return "walking"
        case .swimming: return "swimming"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .hiking: return "hiking"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .yoga: return "yoga"
        default: return "workout"
        }
    }
}

/// Local Capacitor plugin exposing notification reliability & background
/// HealthKit workout delivery controls to JS.
@objc(NotificationReliabilityPlugin)
public class NotificationReliabilityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotificationReliabilityPlugin"
    public let jsName = "NotificationReliability"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isIgnoringBatteryOptimizations", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBatteryOptimizationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkHealthBackgroundPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHealthBackgroundPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncBackgroundWorkoutContext", returnType: CAPPluginReturnPromise)
    ]

    @objc func isIgnoringBatteryOptimizations(_ call: CAPPluginCall) {
        call.resolve(["ignoring": true])
    }

    @objc func openBatteryOptimizationSettings(_ call: CAPPluginCall) {
        call.resolve(["opened": false])
    }

    @objc func checkHealthBackgroundPermission(_ call: CAPPluginCall) {
        let status = BackgroundWorkoutSyncManager.shared.isHealthAvailable ? "granted" : "unavailable"
        call.resolve(["status": status])
    }

    @objc func requestHealthBackgroundPermission(_ call: CAPPluginCall) {
        let status = BackgroundWorkoutSyncManager.shared.isHealthAvailable ? "granted" : "unavailable"
        call.resolve(["status": status])
    }

    @objc func syncBackgroundWorkoutContext(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let loggedIds = (call.getArray("loggedWorkoutIds") as? [String]) ?? []
        let notifiedIds = (call.getArray("notifiedWorkoutIds") as? [String]) ?? []

        var parsedWindows: [[String: Double]] = []
        if let rawWindows = call.getArray("loggedSessionWindows") as? [JSObject] {
            for item in rawWindows {
                if let start = (item["startMs"] as? NSNumber)?.doubleValue,
                   let end = (item["endMs"] as? NSNumber)?.doubleValue,
                   end > start {
                    parsedWindows.append(["startMs": start, "endMs": end])
                }
            }
        }

        let scheduled = BackgroundWorkoutSyncManager.shared.configure(
            enabled: enabled,
            loggedWorkoutIds: loggedIds,
            loggedSessionWindows: parsedWindows,
            notifiedWorkoutIds: notifiedIds
        )
        let status = BackgroundWorkoutSyncManager.shared.isHealthAvailable ? "granted" : "unavailable"
        call.resolve([
            "scheduled": scheduled,
            "backgroundPermission": status
        ])
    }
}
