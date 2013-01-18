ALL_TESTS = $(shell find test -name '*.test.js')

test:
	@./node_modules/.bin/mocha $(ALL_TESTS)

travisci:
	MEMCACHED__HOST=localhost $(MAKE) test

.PHONY: test
