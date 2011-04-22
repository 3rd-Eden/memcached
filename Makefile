doc:
	dox --title "node-memcached" lib/* > doc/index.html

test:
	expresso -I lib $(TESTFLAGS) tests/*.test.js

.PHONY: test doc