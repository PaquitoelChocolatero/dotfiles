#!/bin/sh
bg_color=#80002a
text_color=#ffffff
htext_color=#ff4d88

rofi -show run -lines 3 -eh 2 -width 100 -padding 400 -opacity "85" -bw 0 -color-window "$bg_color, $bg_color, $bg_color" -color-normal "$bg_color, $text_color, $bg_color, $bg_color, $htext_color" -font "System San Francisco Display 20"
