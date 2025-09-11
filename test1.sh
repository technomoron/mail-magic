#!/bin/sh

curl -X POST http://localhost:3776/api/v1/sendform \
  -F "formid=testform" \
  -F "domain=ml.yesmedia.no" \
  -F "vars={\"x\":\"y\"}" \
  -F "attachment1=@./tsconfig.json" \
  -F "attachment2=@./config/testuser/ml.yesmedia.no/form-templates/assets/3075977.png"
 
#  -F "rcpt=bjornjac@pm.me" \
#  -H "Authorization: Bearer apikey-j82lkIOjUuj34sd" \

 