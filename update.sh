#!/bin/bash

#This script autoupdates pacman and yay package managers resolving conflicting files, which are a real pain

input="/tmp/update.txt"
flag=0

function remove_dependencies {
  flag=0
  while IFS= read -r line; do #Read every line of the output
    if [[ "$line" =~ "exists in filesystem" ]]; then #If dependency
      file="$(echo "$line" | cut -d ' ' -f 2)"
      echo "\n------------------>Erasing: $file\n"
      sudo rm -rf "$file" #Remove it
      flag=1
    fi
  done < $input
}

##########################

#Pacman update
sudo pacman -Syyu | tee /tmp/update.txt #Tee copies output instead of redirecting it

remove_dependencies

#If dependecies have been spotted repeat update
if [[ "$flag"==1 ]]; then
  sudo pacman -Syyu 
fi

#Yay update
yay -Syyu | tee /tmp/update.txt

remove_dependencies

#If dependecies have been spotted repeat update
if [[ "$flag"==1 ]]; then
  yay -Syyu 
fi

##########################

echo "\n\nDone :)"
