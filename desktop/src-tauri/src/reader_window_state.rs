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
    if window.is_fullscreen().unwrap_or(true){return;}
    let monitor=window.current_monitor().ok().flatten().or_else(||window.primary_monitor().ok().flatten());
    let Some(monitor)=monitor else{return;};let work=monitor.work_area();
    let (Ok(inner),Ok(outer),Ok(pos))=(window.inner_size(),window.outer_size(),window.outer_position()) else{return;};
    // Tauri sizes the client area, but positions the outer Windows frame. The
    // invisible resize border still counts in GetWindowRect/outer_size.
    let frame=(outer.width.saturating_sub(inner.width),outer.height.saturating_sub(inner.height));
    let (width,x)=fit_axis(inner.width,frame.0,pos.x,work.position.x,work.size.width);
    let (height,y)=fit_axis(inner.height,frame.1,pos.y,work.position.y,work.size.height);
    let client_limit=(work.size.width.saturating_sub(frame.0).max(1),work.size.height.saturating_sub(frame.1).max(1));
    // Lower the minimum before resizing on a small monitor/high DPI desktop.
    let _=window.set_min_size(Some(tauri::PhysicalSize::new(
        ((1024.0*monitor.scale_factor()) as u32).min(client_limit.0),
        ((700.0*monitor.scale_factor()) as u32).min(client_limit.1))));
    if window.is_maximized().unwrap_or(true){return;}
    if (width,height)!=(inner.width,inner.height){let _=window.set_size(tauri::PhysicalSize::new(width,height));}
    if (x,y)!=(pos.x,pos.y){let _=window.set_position(tauri::PhysicalPosition::new(x,y));}
}

// All inputs are physical pixels; persistence stays in the official plugin.
fn fit_axis(inner:u32,frame:u32,pos:i32,start:i32,span:u32)->(u32,i32){
    let size=inner.min(span.saturating_sub(frame).max(1));
    let end=start.saturating_add(span.saturating_sub(size.saturating_add(frame)) as i32);
    (size,pos.clamp(start,end))
}

#[cfg(test)]
mod tests{
    use super::fit_axis;
    #[test] fn small_desktop_includes_native_frame(){
        assert_eq!(fit_axis(1184,16,0,0,1024),(1008,0));
        assert_eq!(fit_axis(791,9,0,0,720),(711,0));
    }
    #[test] fn valid_normal_placement_is_unchanged(){
        assert_eq!(fit_axis(1184,16,100,0,1920),(1184,100));
        assert_eq!(fit_axis(791,9,50,0,1040),(791,50));
    }
    #[test] fn removed_monitor_and_negative_coordinates(){
        assert_eq!(fit_axis(800,16,2400,0,1920),(800,1104));
        assert_eq!(fit_axis(800,16,-2200,-1920,1920),(800,-1920));
        assert_eq!(fit_axis(800,16,0,-1920,1920),(800,-816));
    }
    #[test] fn scaled_frame_and_work_area_offset(){
        assert_eq!(fit_axis(1600,24,100,0,1536),(1512,0));
        assert_eq!(fit_axis(900,14,-100,40,1000),(900,40));
    }
    #[test] fn repeated_fitting_does_not_shrink_again(){
        let first=fit_axis(1184,16,90,0,1024);
        assert_eq!(fit_axis(first.0,16,first.1,0,1024),first);
    }
}
