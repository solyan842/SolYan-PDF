Upstream: tauri-plugin-window-state 2.5.0, Apache-2.0 OR MIT.
Crate SHA256: 5d6815cab7b212f9cfe16a9d79d8d22f9e14159e4a9460f7dec1467167a008e3
Source: https://crates.io/crates/tauri-plugin-window-state/2.5.0
Delta: skip fullscreen in update_state, Moved and Resized. No other behavior changed.
Caller saves cached normal/maximized state before entering presentation.
Installed Reader acceptance checks normal, maximized and close-during-fullscreen restarts.
