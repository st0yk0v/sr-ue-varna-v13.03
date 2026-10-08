<?php
 = 'js/views-bundle.js';
 = file_get_contents();

// Find the position after the first ApplicantCell stub
 = '/window\.ApplicantCell=function _ApplicantCellFallback\(props\)\{return React\.createElement\(\'div\',\{\},\(props\&\&props\.name\)\|\|\'\'\);\);/';
if (preg_match(, , , PREG_OFFSET_CAPTURE)) {
     = [0][1] + strlen([0][0]);
     = 
