#This script lets you open any file with a single command

#!/bin/bash
if [[ "$1" =~ ".jpg" ]] || [[ "$1" =~ ".png" ]]; then #Add more image formats
    xdg-open $1
elif [[ "$1" =~ ".docx" ]] || [[ "$1" =~ ".odt" ]]; then #Add more text formats
    libreoffice $1
elif [[ "$1" =~ ".pptx" ]] || [[ "$1" =~ ".odp" ]]; then #Add more presentation formats
    libreoffice $1
elif [[ "$1" =~ ".pdf" ]]; then
    zathura $1
else
    echo "ERROR: format not implemented, please do"
fi
