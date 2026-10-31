// 發行版不要多開一個主控台視窗
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tsb_macro_editor_lib::run()
}
