#!/bin/bash

#This script autoupdates pacman and yay package managers resolving conflicting files, which are a real pain

input="/tmp/update.txt"

function remove_dependencies {
  while IFS= read -r line; do #Read every line of the output
    if [[ "$line" =~ "exists in filesystem" ]]; then #If dependency
      file="$(echo "$line" | cut -d ' ' -f 2)"
      echo "\n------------------>Erasing: $file\n"
      sudo rm -rf "$file" #Remove it
    fi
  done < $input
}

##########################
sudo pacman -Syyu | tee /tmp/update.txt #Tee copies output instead of redirecting it

remove_dependencies

yay -Syyu | tee /tmp/update.txt

remove_dependencies

echo "\n\nDone :)"
