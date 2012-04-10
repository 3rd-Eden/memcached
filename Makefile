ALL_TESTS = $(shell find tests -name '*.test.js')
REPORTER = spec
UI = bdd

test:
	@./node_modules/.bin/mocha \
		--require should \
		--reporter $(REPORTER) \
		--ui $(UI) \
		--growl \
		$(ALL_TESTS)

doc:
	dox --title "node-memcached" lib/* > doc/index.html

.PHONY: test doc
