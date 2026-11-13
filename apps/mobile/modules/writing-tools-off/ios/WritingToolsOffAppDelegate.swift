import ExpoModulesCore
import UIKit

/// Apple's Writing Tools (Apple Intelligence: rewrite, proofread, compose) stay off in every text
/// input of the app (owner, 2026-11-13: in a quiz they "can help the student cheat"). React Native
/// has no prop for `writingToolsBehavior`, so this sets it natively: when any text field or text
/// view begins editing, its behaviour becomes `.none` and the keyboard is reloaded so the keyboard's
/// Writing Tools key goes too. Copy, paste and autocorrect stay with the inputs' own props
/// (`ANSWER_INPUT` in the quiz). iOS 18 and later only; earlier versions have no Writing Tools.
public class WritingToolsOffAppDelegate: ExpoAppDelegateSubscriber {
  private var observers: [NSObjectProtocol] = []

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    guard #available(iOS 18.0, *) else { return true }
    let center = NotificationCenter.default
    for name in [UITextField.textDidBeginEditingNotification, UITextView.textDidBeginEditingNotification] {
      observers.append(
        center.addObserver(forName: name, object: nil, queue: .main) { note in
          WritingToolsOffAppDelegate.turnOff(note.object)
        }
      )
    }
    return true
  }

  @available(iOS 18.0, *)
  private static func turnOff(_ object: Any?) {
    if let field = object as? UITextField, field.writingToolsBehavior != .none {
      field.writingToolsBehavior = .none
      field.reloadInputViews()
    } else if let view = object as? UITextView, view.writingToolsBehavior != .none {
      view.writingToolsBehavior = .none
      view.reloadInputViews()
    }
  }
}
