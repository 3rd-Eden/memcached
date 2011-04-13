test:
	expresso -I lib $(TESTFLAGS) tests/*.test.js

.PHONY: test