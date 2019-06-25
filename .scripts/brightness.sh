#!/bin/bash

brightness=$(scale=1; xrandr --verbose | awk '/Brightness/ {print $NF}') #Extract the current brightness

# 1 -> up
# 0 -> down
if [[ $1 == "1" ]] && [[ $brightness < 1 ]]; then #Check if brightness is below 100%
    xrandr --output eDP1 --brightness $(echo $brightness + 0.1 | bc ) #Increment brightness 10%
elif [[ $1 == "0" ]] && [[ $brightness > 0.1 ]]; then #Check if brightness is above 10% (doesn't go below that)
    xrandr --output eDP1 --brightness $(echo $brightness - 0.1 | bc ) #Decrement 10%
fi
