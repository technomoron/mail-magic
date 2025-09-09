#!/bin/sh

curl -X POST http://localhost:3776/api/v1/sendform \
  -F "formid=testform" \
  -F "domain=ml.yesmedia.no" \
  -F "vars={\"x\":\"y\"}" \
  -F "attachment1=@./tsconfig.json"
 
#  -F "rcpt=bjornjac@pm.me" \
#  -H "Authorization: Bearer apikey-j82lkIOjUuj34sd" \
 