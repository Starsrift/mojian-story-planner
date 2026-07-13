use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LaunchMode {
    Foreground,
    Background,
}

impl LaunchMode {
    pub fn from_args<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        if args
            .into_iter()
            .any(|argument| argument.as_ref() == "--background")
        {
            Self::Background
        } else {
            Self::Foreground
        }
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CloseAction {
    HideWindow,
    ExitApplication,
}

#[derive(Clone, Debug, Default)]
pub struct LifecycleState {
    quitting: Arc<AtomicBool>,
}

impl LifecycleState {
    pub fn request_quit(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    pub fn close_action(&self) -> CloseAction {
        if self.quitting.load(Ordering::SeqCst) {
            CloseAction::ExitApplication
        } else {
            CloseAction::HideWindow
        }
    }
}
