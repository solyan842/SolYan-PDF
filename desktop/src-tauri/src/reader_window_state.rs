use tauri::Manager;
// Persistence belongs to the maintained official plugin, not a second store.
#[cfg(all(windows,feature="reader-only"))]
pub fn capture(window:&tauri::WebviewWindow){
    use tauri_plugin_window_state::AppHandleExt;
    let _=window.app_handle().save_window_state(flags());
}
#[cfg(not(all(windows,feature="reader-only")))] pub fn capture(_: &tauri::WebviewWindow){}
pub fn save(window:&tauri::WebviewWindow){capture(window);}
#[cfg(all(windows,feature="reader-only"))]
pub fn flags()->tauri_plugin_window_state::StateFlags{
    use tauri_plugin_window_state::StateFlags as F;
    F::SIZE|F::POSITION|F::MAXIMIZED
}

// Missing delta in the plugin: keep the entire normal window inside the current
// work area after monitor removal/DPI changes, not just a 1-pixel intersection.
pub fn fit_to_work_area(window:&tauri::WebviewWindow){
    if window.is_maximized().unwrap_or(true)||window.is_fullscreen().unwrap_or(true){return;}
    let monitor=window.current_monitor().ok().flatten().or_else(||window.primary_monitor().ok().flatten());
    let Some(monitor)=monitor else{return;};let work=monitor.work_area();
    let (Ok(size),Ok(pos))=(window.inner_size(),window.outer_position()) else{return;};
    let width=size.width.min(work.size.width);
    let height=size.height.min(work.size.height);
    let _=window.set_min_size(Some(tauri::PhysicalSize::new(((1024.0*monitor.scale_factor()) as u32).min(work.size.width),((700.0*monitor.scale_factor()) as u32).min(work.size.height))));
    let _=window.set_size(tauri::PhysicalSize::new(width,height));
    let x=pos.x.clamp(work.position.x,work.position.x+(work.size.width-width) as i32);
    let y=pos.y.clamp(work.position.y,work.position.y+(work.size.height-height) as i32);
    let _=window.set_position(tauri::PhysicalPosition::new(x,y));
}
