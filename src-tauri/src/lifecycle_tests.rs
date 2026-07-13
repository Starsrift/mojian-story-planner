use crate::lifecycle::{CloseAction, LaunchMode, LifecycleState};

#[test]
fn detects_background_launch_argument() {
    assert_eq!(
        LaunchMode::from_args(["mojian", "--background"]),
        LaunchMode::Background
    );
    assert_eq!(
        LaunchMode::from_args(["mojian"]),
        LaunchMode::Foreground
    );
}

#[test]
fn close_hides_window_until_user_explicitly_quits() {
    let lifecycle = LifecycleState::default();
    assert_eq!(lifecycle.close_action(), CloseAction::HideWindow);

    lifecycle.request_quit();
    assert_eq!(lifecycle.close_action(), CloseAction::ExitApplication);
}
