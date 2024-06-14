1. Test tbhe interface ID
2. Ensure all errors have tests
3. Ensure all events have tests
4. Initializer:

- Emits event
- Voting settings and token set correctly

5. see (1)
6. Creating a proposal
   f. create proposal returns the correct (new) proposal id

   - has right start date
   - has right end date
   - has block.timestamp in it
   - has correct plugin
     g. Proposal counter is incremented
     e. Votes if votes aren't zero
     f. Does not vote if votes are zero

7. create proposal ID (see above)
8. increment proposal count (see above)

9. Vote:
   a. VoteCast emits tally event

10. getVotes:
    a. returns right tally for that voter and proposal

11.
