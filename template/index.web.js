function main(args) {
  return {
    headers: {},
    statusCode: 200,
    body: '<html><body><h3>hello</h3></body></html>'
  };
}
global.main = main;
