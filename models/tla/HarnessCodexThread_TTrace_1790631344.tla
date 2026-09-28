---- MODULE HarnessCodexThread_TTrace_1790631344 ----
EXTENDS Sequences, TLCExt, HarnessCodexThread, Toolbox, Naturals, TLC

_expression ==
    LET HarnessCodexThread_TEExpression == INSTANCE HarnessCodexThread_TEExpression
    IN HarnessCodexThread_TEExpression!expression
----

_trace ==
    LET HarnessCodexThread_TETrace == INSTANCE HarnessCodexThread_TETrace
    IN HarnessCodexThread_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        resumedOK = (FALSE)
        /\
        cur = (2)
        /\
        rollout = (<<"none", "none", "none", "S">>)
        /\
        saved = (0)
        /\
        forced = (<<FALSE, FALSE, FALSE>>)
        /\
        savedHome = ("unknown")
        /\
        hadConversation = (TRUE)
        /\
        needless = (FALSE)
        /\
        sent = (<<FALSE, FALSE, FALSE>>)
        /\
        tthread = (<<1, 2, 0>>)
        /\
        mustResume = (0)
        /\
        resumedKilled = (FALSE)
        /\
        deadResume = (FALSE)
        /\
        pc = (<<"failed", "onThreadId", "idle">>)
        /\
        mustHome = ("S")
        /\
        tainted = ({})
        /\
        nextT = (3)
        /\
        prov = (<<"k1", "s", "s">>)
        /\
        blindResume = (FALSE)
        /\
        silentReset = (TRUE)
        /\
        notice = (FALSE)
    )
----

_init ==
    /\ prov = _TETrace[1].prov
    /\ mustResume = _TETrace[1].mustResume
    /\ forced = _TETrace[1].forced
    /\ cur = _TETrace[1].cur
    /\ savedHome = _TETrace[1].savedHome
    /\ rollout = _TETrace[1].rollout
    /\ resumedOK = _TETrace[1].resumedOK
    /\ pc = _TETrace[1].pc
    /\ deadResume = _TETrace[1].deadResume
    /\ resumedKilled = _TETrace[1].resumedKilled
    /\ notice = _TETrace[1].notice
    /\ sent = _TETrace[1].sent
    /\ blindResume = _TETrace[1].blindResume
    /\ hadConversation = _TETrace[1].hadConversation
    /\ nextT = _TETrace[1].nextT
    /\ tthread = _TETrace[1].tthread
    /\ tainted = _TETrace[1].tainted
    /\ saved = _TETrace[1].saved
    /\ mustHome = _TETrace[1].mustHome
    /\ needless = _TETrace[1].needless
    /\ silentReset = _TETrace[1].silentReset
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ prov  = _TETrace[i].prov
        /\ prov' = _TETrace[j].prov
        /\ mustResume  = _TETrace[i].mustResume
        /\ mustResume' = _TETrace[j].mustResume
        /\ forced  = _TETrace[i].forced
        /\ forced' = _TETrace[j].forced
        /\ cur  = _TETrace[i].cur
        /\ cur' = _TETrace[j].cur
        /\ savedHome  = _TETrace[i].savedHome
        /\ savedHome' = _TETrace[j].savedHome
        /\ rollout  = _TETrace[i].rollout
        /\ rollout' = _TETrace[j].rollout
        /\ resumedOK  = _TETrace[i].resumedOK
        /\ resumedOK' = _TETrace[j].resumedOK
        /\ pc  = _TETrace[i].pc
        /\ pc' = _TETrace[j].pc
        /\ deadResume  = _TETrace[i].deadResume
        /\ deadResume' = _TETrace[j].deadResume
        /\ resumedKilled  = _TETrace[i].resumedKilled
        /\ resumedKilled' = _TETrace[j].resumedKilled
        /\ notice  = _TETrace[i].notice
        /\ notice' = _TETrace[j].notice
        /\ sent  = _TETrace[i].sent
        /\ sent' = _TETrace[j].sent
        /\ blindResume  = _TETrace[i].blindResume
        /\ blindResume' = _TETrace[j].blindResume
        /\ hadConversation  = _TETrace[i].hadConversation
        /\ hadConversation' = _TETrace[j].hadConversation
        /\ nextT  = _TETrace[i].nextT
        /\ nextT' = _TETrace[j].nextT
        /\ tthread  = _TETrace[i].tthread
        /\ tthread' = _TETrace[j].tthread
        /\ tainted  = _TETrace[i].tainted
        /\ tainted' = _TETrace[j].tainted
        /\ saved  = _TETrace[i].saved
        /\ saved' = _TETrace[j].saved
        /\ mustHome  = _TETrace[i].mustHome
        /\ mustHome' = _TETrace[j].mustHome
        /\ needless  = _TETrace[i].needless
        /\ needless' = _TETrace[j].needless
        /\ silentReset  = _TETrace[i].silentReset
        /\ silentReset' = _TETrace[j].silentReset

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("HarnessCodexThread_TTrace_1790631344.json", _TETrace)

=============================================================================

 Note that you can extract this module `HarnessCodexThread_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `HarnessCodexThread_TEExpression.tla` file takes precedence 
  over the module `HarnessCodexThread_TEExpression` below).

---- MODULE HarnessCodexThread_TEExpression ----
EXTENDS Sequences, TLCExt, HarnessCodexThread, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `HarnessCodexThread` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        prov |-> prov
        ,mustResume |-> mustResume
        ,forced |-> forced
        ,cur |-> cur
        ,savedHome |-> savedHome
        ,rollout |-> rollout
        ,resumedOK |-> resumedOK
        ,pc |-> pc
        ,deadResume |-> deadResume
        ,resumedKilled |-> resumedKilled
        ,notice |-> notice
        ,sent |-> sent
        ,blindResume |-> blindResume
        ,hadConversation |-> hadConversation
        ,nextT |-> nextT
        ,tthread |-> tthread
        ,tainted |-> tainted
        ,saved |-> saved
        ,mustHome |-> mustHome
        ,needless |-> needless
        ,silentReset |-> silentReset
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_provUnchanged |-> prov = prov'
        
        \* Format the `prov` variable as Json value.
        \* ,_provJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(prov)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_provModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].prov # _TETrace[s-1].prov
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE HarnessCodexThread_TETrace ----
\*EXTENDS IOUtils, HarnessCodexThread, TLC
\*
\*trace == IODeserialize("HarnessCodexThread_TTrace_1790631344.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE HarnessCodexThread_TETrace ----
EXTENDS HarnessCodexThread, TLC

trace == 
    <<
    ([resumedOK |-> FALSE,cur |-> 1,rollout |-> <<"none", "none", "none", "S">>,saved |-> 4,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<0, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"idle", "idle", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 1,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> FALSE]),
    ([resumedOK |-> FALSE,cur |-> 1,rollout |-> <<"none", "none", "none", "S">>,saved |-> 4,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<4, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"resume", "idle", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 1,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> FALSE]),
    ([resumedOK |-> FALSE,cur |-> 1,rollout |-> <<"none", "none", "none", "S">>,saved |-> 0,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<4, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"threadStart", "idle", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 1,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> TRUE]),
    ([resumedOK |-> FALSE,cur |-> 1,rollout |-> <<"none", "none", "none", "S">>,saved |-> 0,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<1, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"onThreadId", "idle", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 2,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> FALSE]),
    ([resumedOK |-> FALSE,cur |-> 1,rollout |-> <<"none", "none", "none", "S">>,saved |-> 0,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<1, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"failed", "idle", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 2,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> FALSE]),
    ([resumedOK |-> FALSE,cur |-> 2,rollout |-> <<"none", "none", "none", "S">>,saved |-> 0,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<1, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"failed", "idle", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 2,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> FALSE]),
    ([resumedOK |-> FALSE,cur |-> 2,rollout |-> <<"none", "none", "none", "S">>,saved |-> 0,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<1, 0, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"failed", "threadStart", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 2,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> FALSE,notice |-> FALSE]),
    ([resumedOK |-> FALSE,cur |-> 2,rollout |-> <<"none", "none", "none", "S">>,saved |-> 0,forced |-> <<FALSE, FALSE, FALSE>>,savedHome |-> "unknown",hadConversation |-> TRUE,needless |-> FALSE,sent |-> <<FALSE, FALSE, FALSE>>,tthread |-> <<1, 2, 0>>,mustResume |-> 0,resumedKilled |-> FALSE,deadResume |-> FALSE,pc |-> <<"failed", "onThreadId", "idle">>,mustHome |-> "S",tainted |-> {},nextT |-> 3,prov |-> <<"k1", "s", "s">>,blindResume |-> FALSE,silentReset |-> TRUE,notice |-> FALSE])
    >>
----


=============================================================================

---- CONFIG HarnessCodexThread_TTrace_1790631344 ----
CONSTANTS
    AllowSwitch = TRUE
    AllowCancel = TRUE
    LegacyState = TRUE
    CommitAtTurnStart = TRUE
    ThreadRecordsHome = TRUE
    BindToHome = TRUE
    RecoverMissingRollout = TRUE
    ForceForgets = TRUE
    CommitChecksForce = TRUE
    ForgetOnlyAfterTurnStart = TRUE
    StopForgetsPendingStart = TRUE
    ResetsVisible = TRUE

INVARIANT
    _inv

CHECK_DEADLOCK
    \* CHECK_DEADLOCK off because of PROPERTY or INVARIANT above.
    FALSE

INIT
    _init

NEXT
    _next

CONSTANT
    _TETrace <- _trace

ALIAS
    _expression
=============================================================================
\* Generated on Mon Sep 28 17:35:46 EDT 2026