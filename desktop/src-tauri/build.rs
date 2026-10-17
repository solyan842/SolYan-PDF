use std::{fs, path::Path};

const ICON_SIZE: usize = 64;

fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn is_inside_rounded_square(x: usize, y: usize, inset: usize, radius: usize) -> bool {
    if x < inset || y < inset || x >= ICON_SIZE - inset || y >= ICON_SIZE - inset {
        return false;
    }
    let left = inset + radius;
    let right = ICON_SIZE - inset - radius - 1;
    let top = inset + radius;
    let bottom = ICON_SIZE - inset - radius - 1;
    if (left..=right).contains(&x) || (top..=bottom).contains(&y) {
        return true;
    }
    let cx = if x < left { left } else { right } as isize;
    let cy = if y < top { top } else { bottom } as isize;
    let dx = x as isize - cx;
    let dy = y as isize - cy;
    dx * dx + dy * dy <= (radius * radius) as isize
}

fn pixel_rgba(x: usize, y: usize) -> [u8; 4] {
    if !is_inside_rounded_square(x, y, 3, 13) {
        return [0, 0, 0, 0];
    }

    let mut color = [23, 112, 214, 255];
    if y < 30 {
        color = [38, 137, 230, 255];
    }

    // White document glyph.
    if (18..=46).contains(&x) && (11..=52).contains(&y) {
        color = [250, 253, 255, 255];
    }
    // Folded document corner.
    if x >= 38 && y <= 20 && x + y >= 58 {
        color = [188, 221, 250, 255];
    }
    // Blue SolYan S-like strokes on the page.
    if (23..=40).contains(&x) && (24..=27).contains(&y)
        || (23..=27).contains(&x) && (24..=37).contains(&y)
        || (23..=40).contains(&x) && (34..=38).contains(&y)
        || (36..=40).contains(&x) && (35..=47).contains(&y)
        || (23..=40).contains(&x) && (44..=48).contains(&y)
    {
        color = [23, 112, 214, 255];
    }
    color
}

fn write_windows_icon(path: &Path) -> std::io::Result<()> {
    if path.is_file() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let xor_bytes = ICON_SIZE * ICON_SIZE * 4;
    let and_row_bytes = ((ICON_SIZE + 31) / 32) * 4;
    let and_bytes = and_row_bytes * ICON_SIZE;
    let image_bytes = 40 + xor_bytes + and_bytes;

    let mut ico = Vec::with_capacity(22 + image_bytes);
    // ICONDIR.
    push_u16(&mut ico, 0);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 1);
    // ICONDIRENTRY.
    ico.push(ICON_SIZE as u8);
    ico.push(ICON_SIZE as u8);
    ico.push(0);
    ico.push(0);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 32);
    push_u32(&mut ico, image_bytes as u32);
    push_u32(&mut ico, 22);

    // BITMAPINFOHEADER. Height is doubled because ICO stores XOR + AND masks.
    push_u32(&mut ico, 40);
    push_u32(&mut ico, ICON_SIZE as u32);
    push_u32(&mut ico, (ICON_SIZE * 2) as u32);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 32);
    push_u32(&mut ico, 0);
    push_u32(&mut ico, xor_bytes as u32);
    push_u32(&mut ico, 0);
    push_u32(&mut ico, 0);
    push_u32(&mut ico, 0);
    push_u32(&mut ico, 0);

    // DIB pixels are bottom-up and use BGRA byte order.
    for y in (0..ICON_SIZE).rev() {
        for x in 0..ICON_SIZE {
            let [r, g, b, a] = pixel_rgba(x, y);
            ico.extend_from_slice(&[b, g, r, a]);
        }
    }
    // Fully transparent pixels are already represented by alpha; zero AND mask keeps modern Windows alpha semantics.
    ico.resize(ico.len() + and_bytes, 0);
    fs::write(path, ico)
}

fn main() {
    let icon_path = Path::new("icons/icon.ico");
    write_windows_icon(icon_path).expect("failed to generate required Windows icon.ico");
    println!("cargo:rerun-if-changed=build.rs");
    tauri_build::build()
}
