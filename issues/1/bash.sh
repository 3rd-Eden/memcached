#!/bin/bash
for i in {1..50}
do
  curl http://localhost:8124/ &
done
